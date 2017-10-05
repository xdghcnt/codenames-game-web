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
fs.readFile(__dirname + "/words.txt", "utf8", function (err, words) {
    defaultCodeWords = words.split(" ");
});
const
    rooms = {},
    keys = {},
    tokenTimeouts = {};

// Server part
const app = express();
app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/codenames', function (req, res) {
    res.sendFile(__dirname + '/public/index.html');
});

const server = app.listen(1488);
console.log('Server listening on port 8000');


// Socket.IO part
const io = socketIo(server);

io.on("connection", socket => {
    let room, user, timerInterval,
        colorList = [
            "#E91E63",
            "#F44336",
            "#FF5722",
            "#FFEB3B",
            "#8BC34A",
            "#009688",
            "#03A9F4",
            "#3F51B5",
            "#673AB7",
            "#e91ec0",
            "#795548",
            "#9E9E9E"
        ],
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
            delete room.playerColors[playerId];
            room.onlinePlayers.delete(playerId);
            room.spectators.delete(playerId);
            room.red.delete(playerId);
            room.blu.delete(playerId);
            if (room.bluMaster === playerId)
                room.bluMaster = null;
            else if (room.redMaster === playerId)
                room.redMaster = null;
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
                .concat(Array.apply(null, new Array(1)).map(() => (room.teamTurn = (Math.random() >= 0.5 ? "red" : "blu"))))
                .concat(Array.apply(null, new Array(7)).map(() => "white"))
                .concat(Array.apply(null, new Array(1)).map(() => "black")));
        },
        updateCount = () => {
            room.redCount = keys[room.roomId].filter(card => card === "red").length - room.key.filter(card => card === "red").length;
            room.bluCount = keys[room.roomId].filter(card => card === "blu").length - room.key.filter(card => card === "blu").length;
        },
        endGame = () => {
            clearInterval(timerInterval);
            timerInterval = undefined;
            room.redTime = 0;
            room.bluTime = 0;
            room.key = keys[room.roomId];
        },
        tokenChanged = (index) => {
            if ([...room[room.teamTurn]].filter((player => room.onlinePlayers.has(player))).length === (room.playerTokens[index] && room.playerTokens[index].size)) {
                tokenTimeouts[room.roomId] = setTimeout(() => {
                    const passValue = room.words.length + 1;
                    if (index === passValue || keys[room.roomId][index] !== room.teamTurn) {
                        room.teamTurn = room.teamTurn !== "red" ? "red" : "blu";
                        room.hasCommand = false;
                    }
                    if (index !== passValue) {
                        room.key[index] = keys[room.roomId][index];
                        updateCount();
                        if (room.key[index] === "black" || room.bluCount === 0 || room.redCount === 0) {
                            room.teamWin = room.teamTurn;
                            endGame();
                        }
                    }
                    room.tokenCountdown = null;
                    room.playerTokens = [];
                    update();
                    io.to(room.roomId).emit("highlight-word", index);
                }, 3000);
                room.tokenCountdown = index;
            }
            else {
                clearTimeout(tokenTimeouts[room.roomId]);
                room.tokenCountdown = null;
            }
        },
        getRandomColor = () => {
            let result;
            if (Object.keys(room.playerNames).length > colorList)
                result = "#" + ((1 << 24) * Math.random() | 0).toString(16);
            else
                shuffleArray(colorList.slice()).some(color => {
                    if (!Object.keys(room.playerColors).some(player => room.playerColors[player] === color)) {
                        result = color;
                        return true;
                    }
                });
            return result;
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
            playerColors: {},
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
            teamsLocked: false,
            teamWin: null,
            teamTurn: null,
            playerTokens: [],
            tokenCountdown: null,
            hasCommand: false,
            redTime: 0,
            bluTime: 0
        };
        if (!room.playerNames[user])
            room.spectators.add(user);
        room.onlinePlayers.add(user);
        room.playerNames[user] = args.userName;
        room.playerColors[user] = room.playerColors[user] || getRandomColor();
        if (room.redMaster === user || room.bluMaster === user) {
            socket.join(room.roomId + "-master");
            socket.emit("masterKey", keys[room.roomId]);
        }
        update();
    });
    socket.on("word-click", (wordIndex) => {
        if (room.hasCommand && ((room.red.has(user) && room.teamTurn === "red") || (room.blu.has(user) && room.teamTurn === "blu")) && !room.key[wordIndex]) {
            room.playerTokens[wordIndex] = room.playerTokens[wordIndex] || new JSONSet();
            [...room.playerTokens].forEach(
                (players, index) => index !== wordIndex
                    && players
                    && players.delete(user)
                    && tokenChanged(index)
            );
            if (!room.playerTokens[wordIndex].delete(user))
                room.playerTokens[wordIndex].add(user);
            tokenChanged(wordIndex);
            update();
        }
        if (room.red.has(user) || room.blu.has(user))
            io.to(room.roomId).emit("highlight-word", wordIndex);
    });
    socket.on("change-color", () => {
        room.playerColors[user] = getRandomColor();
        update();
    });
    socket.on("toggle-lock", () => {
        room.teamsLocked = !room.teamsLocked;
        update();
    });
    socket.on("start-game", () => {
        endGame();
        room.teamsLocked = true;
        room.redCommands = [];
        room.bluCommands = [];
        room.teamWin = null;
        room.hasCommand = false;
        dealWords();
        updateCount();
        io.to(room.roomId + "-master").emit("masterKey", keys[room.roomId]);
        update();
    });
    socket.on("add-command", (color, command) => {
        if (command) {
            room.hasCommand = true;
            room[`${color}Commands`].push(command);
            if (!timerInterval) {
                let time = new Date();
                timerInterval = setInterval(() => {
                    room[`${room.teamTurn}Time`] += new Date() - time;
                    time = new Date();
                }, 100);
            }
        }
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
        let players = [];
        players = players.concat([...room.red]);
        players = players.concat([...room.blu]);
        if (room.redMaster)
            players.push(room.redMaster);
        if (room.bluMaster)
            players.push(room.bluMaster);
        shuffleArray(players);
        room.redMaster = players.shift();
        room.bluMaster = players.shift();
        room.red = new JSONSet(players.splice(0, Math.ceil(players.length / 2)));
        room.blu = new JSONSet(players);
        update();
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
    socket.on("ping", () => {
        room.onlinePlayers.add(user);
        update();
    });
    socket.emit("re-init");
});

