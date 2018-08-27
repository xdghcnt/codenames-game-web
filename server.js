const
    path = require('path'),
    fs = require('fs'),
    express = require('express'),
    socketIo = require("socket.io"),
    reCAPTCHA = require('recaptcha2'),
    logging = false,
    useCaptcha = false;

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

const recaptcha = new reCAPTCHA({
    siteKey: "",
    secretKey: ""
});

let defaultCodeWords;
fs.readFile(__dirname + "/words.json", "utf8", function (err, words) {
    defaultCodeWords = JSON.parse(words);
});

const defaultCodePics = Array(278).fill().map((_, idx) => idx + 1);
const
    rooms = {},
    intervals = {},
    masterKeys = {},
    authorizedUsers = {},
    attemptIPs = {},
    roomWords = {},
    roomPics = {},
    roomTraitors = {},
    prevEventTimeIP = {},
    sockets = {};

// Server part
const app = express();

function log(text) {
    if (logging)
        fs.appendFile(__dirname + "/logs.txt", `${text}\n`, () => {
        })
}

app.use('/', function (req, res, next) {
    console.log(`${(new Date()).toISOString()}: ${req.headers['x-forwarded-for'] || req.connection.remoteAddress} - static: ${req.url}`);
    next();
});

app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/codenames', function (req, res) {
    log(`${(new Date()).toISOString()}: ${req.headers['x-forwarded-for'] || req.connection.remoteAddress} - index.html`);
    res.sendFile(__dirname + '/public/index.html');
});

const server = app.listen(14888);
console.log('Server listening on port 14888');

// Socket.IO part
const io = socketIo(server, {maxHttpBufferSize: 5000, transports: ["websocket"]});

io.on("connection", socket => {
    log(`${(new Date()).toISOString()}: ${socket.handshake.address} - connected to socket`);
    if (sockets[socket.handshake.address]) {
        log(`${(new Date()).toISOString()}: ${socket.handshake.address} - disconnected (new session)`);
        sockets[socket.handshake.address].disconnect(true);
        return;
    }
    sockets[socket.handshake.address] = socket;
    let room, user, prevRestartTime = new Date(), updateNeeded = false;
    prevEventTimeIP[socket.handshake.address] = +(new Date()) - 105;
    socket.use((packet, next) => {
        log(`${(new Date()).toISOString()}: ${socket.handshake.address} - ${JSON.stringify(packet)}`);
        if (+(new Date()) - prevEventTimeIP[socket.handshake.address] < 50) {
            log(`${(new Date()).toISOString()}: ${socket.handshake.address} - disconnected (too fast)`);
            socket.disconnect(true);
            return;
        }
        prevEventTimeIP[socket.handshake.address] = new Date();
        if (packet[0] === "init" || packet[0] === "auth" || room) {
            return next();
        }
    });
    const updateInterval = setInterval(() => {
        if (updateNeeded) {
            io.to(room.roomId).emit("state", room);
            updateNeeded = false;
        }
    }, 100);
    const update = () => io.to(room.roomId).emit("state", room),
        leaveTeams = () => {
            room.playerTokens = [];
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
            room.onlinePlayers.delete(playerId);
            room.spectators.delete(playerId);
            room.red.delete(playerId);
            room.blu.delete(playerId);
            if (room.bluMaster === playerId)
                room.bluMaster = null;
            else if (room.redMaster === playerId)
                room.redMaster = null;
            room.playerTokens = [];
        },
        dealWords = () => {
            roomWords[room.roomId] = roomWords[room.roomId] || [];
            roomPics[room.roomId] = roomPics[room.roomId] || [];
            if (!room.picturesMode) {
                if (roomWords[room.roomId].length < 25) {
                    roomWords[room.roomId] = [];
                    room.wordsLevel.forEach((value, index) => {
                        if (value)
                            roomWords[room.roomId] = roomWords[room.roomId].concat(defaultCodeWords[index])
                    });
                    shuffleArray(roomWords[room.roomId]);
                }
                room.words = roomWords[room.roomId].splice(0, 25);
            } else {
                if (roomPics[room.roomId].length < 25)
                    roomPics[room.roomId] = shuffleArray(defaultCodePics.slice());
                room.words = roomPics[room.roomId].splice(0, 25);
            }
            room.key = [];
            masterKeys[room.roomId] = shuffleArray([]
                .concat(Array.apply(null, new Array(8)).map(() => "red"))
                .concat(Array.apply(null, new Array(8)).map(() => "blu"))
                .concat(Array.apply(null, new Array(1)).map(() => (room.teamTurn = (Math.random() >= 0.5 ? "red" : "blu"))))
                .concat(Array.apply(null, new Array(7)).map(() => "white"))
                .concat(Array.apply(null, new Array(1)).map(() => "black")));
            room.passIndex = room.words.length + 1;
            io.to(room.roomId).emit("masterKeyUpdated");
        },
        updateCount = () => {
            room.redCount = masterKeys[room.roomId].filter(card => card === "red").length - room.key.filter(card => card === "red").length;
            room.bluCount = masterKeys[room.roomId].filter(card => card === "blu").length - room.key.filter(card => card === "blu").length;
        },
        endGame = () => {
            room.teamsLocked = false;
            room.traitors = [roomTraitors[room.roomId].blu, roomTraitors[room.roomId].red];
            clearInterval(intervals[room.roomId].team);
            clearInterval(intervals[room.roomId].move);
            intervals[room.roomId].team = undefined;
            room.redTime = 0;
            room.bluTime = 0;
            room.key = masterKeys[room.roomId];
        },
        startGame = () => {
            room.paused = false;
            room.teamsLocked = true;
            room.redCommands = [];
            room.bluCommands = [];
            room.playerTokens = [];
            room.traitors = [];
            room.teamWin = null;
            room.time = null;
            room.hasCommand = false;
            room.masterAdditionalTime = false;
            clearInterval(intervals[room.roomId].team);
            clearInterval(intervals[room.roomId].move);
            clearTimeout(intervals[room.roomId].token);
            if (room.traitorMode)
                roomTraitors[room.roomId] = {
                    blu: shuffleArray([...room.blu])[0],
                    red: shuffleArray([...room.red])[0]
                };
            dealWords();
            updateCount();
            if (room.timed && room.masterFirstTime)
                startMasterTimer(true);
        },
        startMasterTimer = (first) => {
            clearInterval(intervals[room.roomId].move);
            room.masterAdditionalTime = false;
            room.time = (first ? room.masterFirstTime : room.masterTime) * 1000;
            let time = new Date();
            intervals[room.roomId].move = setInterval(() => {
                if (!room.paused) {
                    room.time -= new Date() - time;
                    time = new Date();
                    if (room.time <= 0) {
                        room.masterAdditionalTime = true;
                        startTeamTimer();
                        update();
                    }
                } else time = new Date();
            }, 100);
        },
        addCommand = (color, command) => {
            room.hasCommand = true;
            room[`${color}Commands`].push(command);
            if (room.timed && !room.masterAdditionalTime)
                startTeamTimer();
            else if (!room.timed && !intervals[room.roomId].team) {
                let time = new Date();
                intervals[room.roomId].team = setInterval(() => {
                    room[`${room.teamTurn}Time`] += new Date() - time;
                    time = new Date();
                }, 100);
            }
        },
        startTeamTimer = () => {
            clearInterval(intervals[room.roomId].move);
            room.time = room.teamTime * 1000;
            let time = new Date();
            intervals[room.roomId].move = setInterval(() => {
                if (!room.paused) {
                    room.time -= new Date() - time;
                    time = new Date();
                    if (room.time <= 0) {
                        clearTimeout(intervals[room.roomId].token);
                        const votedWords = [];
                        let usedTokens = 0;
                        room.playerTokens[room.passIndex] = room.playerTokens[room.passIndex] || new JSONSet();
                        room.playerTokens.forEach((players, index) => {
                            const word = {index: index, votes: players.size};
                            usedTokens += players.size;
                            if (index === room.passIndex)
                                word.votes += [...room[room.teamTurn]]
                                    .filter(player => room.onlinePlayers.has(player)).length - usedTokens;
                            votedWords.push(word);
                        });
                        const
                            sorted = votedWords.reverse().sort((a, b) => b.votes - a.votes),
                            mostVoted = sorted && sorted[0] && (!sorted[1] || (sorted[0].votes > sorted[1].votes));
                        chooseWord((mostVoted && sorted[0].index) || room.passIndex);
                    }
                } else time = new Date();
            }, 100);
        },
        chooseWord = (index) => {
            if (index === room.passIndex || masterKeys[room.roomId][index] !== room.teamTurn) {
                room.teamTurn = room.teamTurn !== "red" ? "red" : "blu";
                room.hasCommand = false;
                if (room.timed)
                    startMasterTimer();
            } else room.time += room.addTime * 1000;
            if (index !== room.passIndex) {
                room.key[index] = masterKeys[room.roomId][index];
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
        },
        tokenChanged = (index) => {
            if ([...room[room.teamTurn]].filter((player => room.onlinePlayers.has(player))).length === (room.playerTokens[index] && room.playerTokens[index].size)) {
                intervals[room.roomId].token = setTimeout(() => {
                    chooseWord(index);
                }, room.tokenDelay);
                room.tokenCountdown = index;
            }
            else {
                clearTimeout(intervals[room.roomId].token);
                room.tokenCountdown = null;
            }
        },
        getRandomColor = () => {
            return "#" + ((1 << 24) * Math.random() | 0).toString(16);
        },
        canStartGame = () => Object.keys(room.playerNames).length > 0 && (+(new Date()) - prevRestartTime) > 3000,
        init = (initArgs) => {
            socket.join(initArgs.roomId);
            user = initArgs.userId;
            if (!rooms[initArgs.roomId]) {
                masterKeys[initArgs.roomId] = {};
                intervals[initArgs.roomId] = {};
                roomTraitors[initArgs.roomId] = {};
            }
            room = rooms[initArgs.roomId] = rooms[initArgs.roomId] || {
                inited: true,
                roomId: initArgs.roomId,
                hostId: user,
                spectators: new JSONSet(),
                playerNames: {
                    a: "a",
                    b: "b",
                    c: "c",
                    d: "d",
                    e: "e",
                    f: "f"
                },
                playerColors: {},
                onlinePlayers: new JSONSet(),
                red: new JSONSet(["a", "b", "c"]),
                blu: new JSONSet(["d", "e", "f"]),
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
                bluTime: 0,
                timed: true,
                masterTime: 60,
                masterFirstTime: 0,
                teamTime: 60,
                addTime: 15,
                tokenDelay: 1500,
                time: null,
                masterAdditionalTime: false,
                passIndex: null,
                paused: false,
                picturesMode: false,
                traitorMode: false,
                traitors: [],
                authRequired: false,
                wordsLevel: [false, true, true, true]
            };
            if (!room.playerNames[user])
                room.spectators.add(user);
            room.onlinePlayers.add(user);
            room.playerNames[user] = initArgs.userName.substr && initArgs.userName.substr(0, 60);
            room.playerColors[user] = room.playerColors[user] || getRandomColor();
            socket.emit("masterKeyUpdated");
            update();
        };
    socket.on("init", args => {
        if (useCaptcha && !authorizedUsers[args.userId + args.roomId])
            socket.emit("auth-required");
        else
            init(args);
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
            io.to(room.roomId).emit("highlight-word", wordIndex, user);
    });
    socket.on("request-master-key", () => {
        if (room.redMaster === user || room.bluMaster === user)
            socket.emit("masterKey", masterKeys[room.roomId], room.redMaster === user ? roomTraitors[room.roomId].blu : roomTraitors[room.roomId].red);
        else if (roomTraitors[room.roomId].blu === user)
            socket.emit("masterKey", masterKeys[room.roomId].map((color) => ~["red", "black"].indexOf(color) ? color : "none"), user);
        else if (roomTraitors[room.roomId].red === user)
            socket.emit("masterKey", masterKeys[room.roomId].map((color) => ~["blu", "black"].indexOf(color) ? color : "none"), user);
        else
            socket.emit("masterKey", null);
    });
    socket.on("change-color", () => {
        room.playerColors[user] = getRandomColor();
        update();
    });
    socket.on("toggle-lock", () => {
        if (user === room.hostId)
            room.teamsLocked = !room.teamsLocked;
        update();
    });
    socket.on("start-game", () => {
        if (user === room.hostId && canStartGame()) {
            room.picturesMode = false;
            room.timed = false;
            room.tokenDelay = 3000;
            startGame();
            update();
        }
    });
    socket.on("start-game-timed", () => {
        if (user === room.hostId && canStartGame()) {
            room.picturesMode = false;
            room.timed = true;
            room.tokenDelay = 1500;
            startGame();
            update();
        }
    });
    socket.on("start-game-pictures", () => {
        if (user === room.hostId && canStartGame()) {
            room.picturesMode = true;
            room.timed = true;
            room.tokenDelay = 1500;
            startGame();
            update();
        }
    });
    socket.on("toggle-words-level", (level) => {
        if (user === room.hostId && ~[0, 1, 2, 3].indexOf(level) && room.wordsLevel.filter((value, index) => index !== level && value).length > 0) {
            roomWords[room.roomId] = [];
            room.wordsLevel[level] = !room.wordsLevel[level];
        }
        update();
    });
    socket.on("toggle-traitor-mode", () => {
        if (user === room.hostId)
            room.traitorMode = !room.traitorMode;
        update();
    });
    socket.on("set-master-time", (value) => {
        if (user === room.hostId && parseInt(value))
            room.masterTime = parseInt(value);
        update();
    });
    socket.on("set-master-first-time", (value) => {
        if (user === room.hostId && !isNaN(parseInt(value)))
            room.masterFirstTime = parseInt(value);
        update();
    });
    socket.on("set-team-time", (value) => {
        if (user === room.hostId && parseInt(value))
            room.teamTime = parseInt(value);
        update();
    });
    socket.on("set-add-time", (value) => {
        if (user === room.hostId && parseInt(value))
            room.addTime = parseInt(value);
        update();
    });
    socket.on("add-command", (color, command) => {
        if (command && room.teamTurn === color)
            addCommand(color, command);
        update();
    });
    socket.on("edit-command", (command, index, color) => {
        if (user === room.hostId && room[`${color}Commands`] && room[`${color}Commands`][index])
            room[`${color}Commands`][index] = command;
        update();
    });
    socket.on("stop-game", () => {
        if (user === room.hostId)
            room.teamsLocked = false;
        update();
    });
    socket.on("toggle-pause", () => {
        if (user === room.hostId) {
            if (canStartGame() && (room.words.length === 0 || room.teamWin !== null))
                startGame();
            else
                room.paused = !room.paused;
        }
        update();
    });
    socket.on("restart-game", () => {
        if (user === room.hostId && canStartGame())
            startGame();
        update();
    });
    socket.on("skip-team", () => {
        if (user === room.hostId) {
            room.teamTurn = room.teamTurn !== "red" ? "red" : "blu";
            room.hasCommand = false;
            room.masterAdditionalTime = false;
            startTeamTimer();
            update();
        }
    });
    socket.on("change-name", value => {
        if (value)
            room.playerNames[user] = value.substr && value.substr(0, 60);
        update();
    });
    socket.on("remove-player", playerId => {
        if (playerId && user === room.hostId) {
            removePlayer(playerId);
            if (room.onlinePlayers.has(playerId))
                room.spectators.add(playerId);
        }
        update();
    });
    socket.on("remove-offline", () => {
        if (user === room.hostId)
            Object.keys(room.playerNames).forEach(playerId => {
                if (!room.onlinePlayers.has(playerId))
                    removePlayer(playerId);
            });
        update();
    });
    socket.on("shuffle-players", () => {
        if (user === room.hostId) {
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
            //io.to(room.roomId).emit("masterKeyUpdated");
        }
    });
    socket.on("give-host", playerId => {
        if (playerId && user === room.hostId)
            room.hostId = playerId;
        update();
    });
    socket.on("team-join", (color, isMaster) => {
        if (color === "red" || color === "blu") {
            if (!isMaster) {
                leaveTeams();
                room[color].add(user)
            }
            else if (!room[`${color}Master`]) {
                leaveTeams();
                room[`${color}Master`] = user;
            }
            socket.emit("masterKeyUpdated");
            update();
        }
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
        delete sockets[socket.handshake.address];
        clearInterval(updateInterval);
    });
    socket.on("ping", () => {
        room.onlinePlayers.add(user);
        update();
    });
    socket.on("auth", (key, initArgs) => {
        if (initArgs && !room && !attemptIPs[socket.handshake.address]) {
            attemptIPs[socket.handshake.address] = true;
            recaptcha.validate(key)
                .then(() => {
                    authorizedUsers[initArgs.userId + initArgs.roomId] = true;
                    init(initArgs);
                })
                .catch(() => socket.emit("reload"))
                .then(() => {
                    setTimeout(() => {
                        delete attemptIPs[socket.handshake.address];
                    }, 5000)
                })
        }
    });
});

