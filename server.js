const
    path = require('path'),
    fs = require('fs'),
    express = require('express'),
    socketIo = require("socket.io");

function makeId() {
    let text = "";
    const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < 5; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

function shuffleArray(array) {
    array.sort(() => (Math.random() - 0.5));
    return array;
}

class JSONSet extends Set {
    constructor(iterable) {
        super(iterable)
    }

    toJSON() {
        return [...this]
    }
}

let defaultCodeWords;
fs.readFile("words.txt", "utf8", function (err, words) {
    defaultCodeWords = words.split(" ");
});
const
    rooms = {},
    keys = {};

// Server part
const app = express();
app.use('/', express.static(path.join(__dirname, 'public')));

const server = app.listen(8000);
console.log('Server listening on port 8000');


// Socket.IO part
const io = socketIo(server);

io.on("connection", socket => {
    let room, user,
        update = () => io.to(room.roomId).emit("state", room),
        leaveTeams = () => {
            room.red.delete(user);
            room.blu.delete(user);
            room.spectators.delete(user);
            if (room.redMaster === user)
                room.redMaster = null;
            else if (room.bluMaster === user)
                room.bluMaster = null;
            socket.leave(room.roomId + "-master");
            socket.emit("masterKey", null);
        },
        removePlayer = playerId => {
            delete room.playerNames[playerId];
            room.onlinePlayers.delete(playerId);
            room.spectators.delete(playerId);
        },
        getPlayerByName = name => {
            let playerId;
            Object.keys(room.playerNames).forEach(userId => {
                if (room.playerNames[userId] === name)
                    playerId = userId;
            });
        },
        dealWords = () => {
            room.words = shuffleArray(defaultCodeWords.slice()).splice(0, 25);
            room.key = [];
            keys[room.roomId] = shuffleArray([]
                .concat(Array.apply(null, new Array(8)).map(() => "red"))
                .concat(Array.apply(null, new Array(8)).map(() => "blu"))
                .concat(Array.apply(null, new Array(1)).map(() => (Math.random() >= 0.5 ? "red" : "blu")))
                .concat(Array.apply(null, new Array(7)).map(() => "white"))
                .concat(Array.apply(null, new Array(1)).map(() => "black")));
        },
        updateCount = () => {
            room.redCount = keys[room.roomId].filter(card => card === "red").length - room.key.filter(card => card === "red").length;
            room.bluCount = keys[room.roomId].filter(card => card === "blu").length - room.key.filter(card => card === "blu").length;
        };
    socket.on("init", args => {
        socket.join(args.roomId);
        user = args.userId;
        room = rooms[args.roomId] = rooms[args.roomId] || {
            inited: true,
            roomId: args.roomId,
            hostId: user,
            spectators: new JSONSet(),
            playerNames: {},
            onlinePlayers: new JSONSet(),
            red: new JSONSet(),
            blu: new JSONSet(),
            key: [],
            words: [],
            redMaster: null,
            bluMaster: null,
            redCommands: [],
            bluCommands: [],
            redCount: null,
            bluCount: null,
            teamsLocked: false
        };
        if (!room.playerNames[user])
            room.spectators.add(user);
        room.onlinePlayers.add(user);
        room.playerNames[user] = args.userName;
        if (room.redMaster === user || room.bluMaster === user) {
            socket.join(room.roomId + "-master");
            socket.emit("masterKey", keys[room.roomId]);
        }
        update();
    });
    socket.on("word-click", (wordIndex) => {
        if (room.redMaster === user || room.bluMaster === user) {
            room.key[wordIndex] = keys[room.roomId][wordIndex];
            updateCount();
            update();
        }
        io.to(room.roomId).emit("highlight-word", wordIndex)
    });
    socket.on("toggle-lock", () => {
        room.teamsLocked = !room.teamsLocked;
        update();
    });
    socket.on("start-game", () => {
        room.teamsLocked = true;
        room.redCommands = [];
        room.bluCommands = [];
        dealWords();
        updateCount();
        io.to(room.roomId + "-master").emit("masterKey", keys[room.roomId]);
        update();
    });
    socket.on("add-command", (color, command) => {
        if (command)
            room[`${color}Commands`].push(command);
        update();
    });
    socket.on("stop-game", () => {
        room.teamsLocked = false;
        update();
    });
    socket.on("change-name", value => {
        if (value)
            room.playerNames[user] = value;
        update();
    });
    socket.on("remove-player", name => {
        const playerId = getPlayerByName(name);
        if (playerId)
            removePlayer(playerId);
        update();
    });
    socket.on("remove-offline", () => {
        Object.keys(room.playerNames).forEach(playerId => {
            if (!room.onlinePlayers.has(playerId))
                removePlayer(playerId);
        });
        update();
    });
    socket.on("shuffle-players", () => {

    });
    socket.on("give-host", name => {
        const playerId = getPlayerByName(name);
        if (playerId)
            room.hostId = playerId;
        update();
    });
    socket.on("team-join", (color, isMaster) => {
        leaveTeams();
        if (!isMaster)
            room[color].add(user);
        else if (!room[`${color}Master`]) {
            room[`${color}Master`] = user;
            socket.join(room.roomId + "-master");
            socket.emit("masterKey", keys[room.roomId]);
        }
        update();
    });
    socket.on("spectators-join", () => {
        leaveTeams();
        room.spectators.add(user);
        update();
    });
    socket.on("disconnect", () => {
        if (room) {
            room.onlinePlayers.delete(user);
            if (room.spectators.has(user))
                delete room.playerNames[user];
            room.spectators.delete(user);
            update();
        }
    });
    socket.emit("re-init");
});

