const
    path = require('path'),
    fs = require('fs'),
    express = require('express'),
    socketIo = require("socket.io"),
    http = require('http');

function makeId() {
    let text = "";
    const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < 5; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

function shuffleArray(array) {
    array.sort(() => (Math.random() - 0.5));
}

class JSONSet extends Set {
    constructor(iterable) {
        super(iterable)
    }

    toJSON() {
        return [...this]
    }
}

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
            onlinePlayers: new JSONSet()
        };
        if (!room.playerNames[user])
            room.spectators.add(user);
        room.onlinePlayers.add(user);
        room.playerNames[user] = args.userName;
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

