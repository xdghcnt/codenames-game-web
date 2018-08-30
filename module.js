function init(wsServer, path) {
    const
        fs = require('fs'),
        express = require('express'),
        app = wsServer.app,
        users = wsServer.users.of("codenames");

    let defaultCodeWords;
    fs.readFile(__dirname + "/words.json", "utf8", function (err, words) {
        defaultCodeWords = JSON.parse(words);
    });
    const defaultCodePics = Array(278).fill().map((_, idx) => idx + 1);

    app.get(path, function (req, res) {
        res.sendFile(`${__dirname}/public/app.html`);
    });
    app.use("/codenames", express.static(`${__dirname}/public`));

    const
        rooms = new Map(),
        onlineUsers = new Map();

    users.on("user-joined", (id, data) => {
        if (data.roomId) {
            if (!rooms.has(data.roomId))
                rooms.set(data.roomId, new GameState(id, data, users));
            rooms.get(data.roomId).userJoin(data);
            onlineUsers.set(data.userId, data.roomId);
        }
    });
    users.on("user-left", (id) => {
        if (onlineUsers.has(id)) {
            const roomId = onlineUsers.get(id);
            if (rooms.has(roomId))
                rooms.get(roomId).userLeft(id);
            onlineUsers.delete(id);
        }
    });
    users.on("user-event", (id, event, data) => {
        if (onlineUsers.has(id)) {
            const roomId = onlineUsers.get(id);
            if (rooms.has(roomId))
                rooms.get(roomId).userEvent(id, event, data);
        }
    });

    class GameState {
        constructor(hostId, hostData, userRegistry) {
            const
                room = {
                    inited: true,
                    hostId: hostId,
                    spectators: new JSONSet(),
                    playerColors: {},
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
                },
                intervals = {};
            let masterKey, words, pics, traitors = {};

            const
                send = (target, event, data) => userRegistry.send(target, event, data),
                update = () => send(room.onlinePlayers, "state", room),
                leaveTeams = (user) => {
                    room.playerTokens = [];
                    room.red.delete(user);
                    room.blu.delete(user);
                    room.spectators.delete(user);
                    if (room.redMaster === user)
                        room.redMaster = null;
                    else if (room.bluMaster === user)
                        room.bluMaster = null;
                    send(user, "masterKey", null);
                },
                removePlayer = (playerId) => {
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
                    words = words || [];
                    pics = pics || [];
                    if (!room.picturesMode) {
                        if (words.length < 25) {
                            words = [];
                            room.wordsLevel.forEach((value, index) => {
                                if (value)
                                    words = words.concat(defaultCodeWords[index])
                            });
                            shuffleArray(words);
                        }
                        room.words = words.splice(0, 25);
                    } else {
                        if (pics.length < 25)
                            pics = shuffleArray(defaultCodePics.slice());
                        room.words = pics.splice(0, 25);
                    }
                    room.key = [];
                    masterKey = shuffleArray([]
                        .concat(Array.apply(null, new Array(8)).map(() => "red"))
                        .concat(Array.apply(null, new Array(8)).map(() => "blu"))
                        .concat(Array.apply(null, new Array(1)).map(() => (room.teamTurn = (Math.random() >= 0.5 ? "red" : "blu"))))
                        .concat(Array.apply(null, new Array(7)).map(() => "white"))
                        .concat(Array.apply(null, new Array(1)).map(() => "black")));
                    room.passIndex = room.words.length + 1;
                    [room.redMaster, room.bluMaster, traitors.blu, traitors.red].forEach((user) => {
                        sendMasterKey(user);
                    });
                },
                updateCount = () => {
                    room.redCount = masterKey.filter(card => card === "red").length - room.key.filter(card => card === "red").length;
                    room.bluCount = masterKey.filter(card => card === "blu").length - room.key.filter(card => card === "blu").length;
                },
                endGame = () => {
                    room.teamsLocked = false;
                    room.traitors = [traitors.blu, traitors.red];
                    clearInterval(intervals.team);
                    clearInterval(intervals.move);
                    intervals.team = undefined;
                    room.redTime = 0;
                    room.bluTime = 0;
                    room.key = masterKey;
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
                    clearInterval(intervals.team);
                    clearInterval(intervals.move);
                    clearTimeout(intervals.token);
                    if (room.traitorMode)
                        traitors = {
                            blu: shuffleArray([...room.blu])[0],
                            red: shuffleArray([...room.red])[0]
                        };
                    dealWords();
                    updateCount();
                    if (room.timed && room.masterFirstTime)
                        startMasterTimer(true);
                },
                startMasterTimer = (first) => {
                    clearInterval(intervals.move);
                    room.masterAdditionalTime = false;
                    room.time = (first ? room.masterFirstTime : room.masterTime) * 1000;
                    let time = new Date();
                    intervals.move = setInterval(() => {
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
                    else if (!room.timed && !intervals.team) {
                        let time = new Date();
                        intervals.team = setInterval(() => {
                            room[`${room.teamTurn}Time`] += new Date() - time;
                            time = new Date();
                        }, 100);
                    }
                },
                startTeamTimer = () => {
                    clearInterval(intervals.move);
                    room.time = room.teamTime * 1000;
                    let time = new Date();
                    intervals.move = setInterval(() => {
                        if (!room.paused) {
                            room.time -= new Date() - time;
                            time = new Date();
                            if (room.time <= 0) {
                                clearTimeout(intervals.token);
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
                    if (index === room.passIndex || masterKey[index] !== room.teamTurn) {
                        room.teamTurn = room.teamTurn !== "red" ? "red" : "blu";
                        room.hasCommand = false;
                        if (room.timed)
                            startMasterTimer();
                    } else room.time += room.addTime * 1000;
                    if (index !== room.passIndex) {
                        room.key[index] = masterKey[index];
                        updateCount();
                        if (room.key[index] === "black" || room.bluCount === 0 || room.redCount === 0) {
                            room.teamWin = room.teamTurn;
                            endGame();
                        }
                    }
                    room.tokenCountdown = null;
                    room.playerTokens = [];
                    update();
                    send(room.onlinePlayers, "highlight-word", index);
                },
                tokenChanged = (index) => {
                    if ([...room[room.teamTurn]].filter((player => room.onlinePlayers.has(player))).length === (room.playerTokens[index] && room.playerTokens[index].size)) {
                        intervals.token = setTimeout(() => {
                            chooseWord(index);
                        }, room.tokenDelay);
                        room.tokenCountdown = index;
                    }
                    else {
                        clearTimeout(intervals.token);
                        room.tokenCountdown = null;
                    }
                },
                getRandomColor = () => {
                    return "#" + ((1 << 24) * Math.random() | 0).toString(16);
                },
                sendMasterKey = (user) => {
                    if (room.onlinePlayers.has(user)) {
                        if (room.redMaster === user || room.bluMaster === user)
                            send(user, "masterKey", masterKey, room.redMaster === user ? traitors.blu : traitors.red);
                        else if (traitors.blu === user)
                            send(user, "masterKey", masterKey.map((color) => ~["red", "black"].indexOf(color) ? color : "none"), user);
                        else if (traitors.red === user)
                            send(user, "masterKey", masterKey.map((color) => ~["blu", "black"].indexOf(color) ? color : "none"), user);
                        else
                            send(user, "masterKey", null);
                    }
                },
                userJoin = (data) => {
                    const user = data.userId;
                    if (!room.playerNames[user])
                        room.spectators.add(user);
                    room.onlinePlayers.add(user);
                    room.playerNames[user] = data.userName.substr && data.userName.substr(0, 60);
                    room.playerColors[user] = room.playerColors[user] || getRandomColor();
                    sendMasterKey(user);
                    update();
                },
                userLeft = (user) => {
                    room.onlinePlayers.delete(user);
                    if (room.spectators.has(user))
                        delete room.playerNames[user];
                    room.spectators.delete(user);
                    update();
                },
                userEvent = (user, event, data) => {
                    try {
                        if (this.eventHandlers[event])
                            this.eventHandlers[event](user, data[0], data[1], data[2]);
                    } catch (error) {
                        console.error(error);
                        userRegistry.log(error.message);
                    }
                };
            this.userJoin = userJoin;
            this.userLeft = userLeft;
            this.userEvent = userEvent;
            this.eventHandlers = {
                "word-click": (user, wordIndex) => {
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
                        send(room.onlinePlayers, "highlight-word", wordIndex, user);
                },
                "change-color": (user) => {
                    room.playerColors[user] = getRandomColor();
                    update();
                },
                "toggle-lock": (user) => {
                    if (user === room.hostId)
                        room.teamsLocked = !room.teamsLocked;
                    update();
                },
                "start-game": (user) => {
                    if (user === room.hostId) {
                        room.picturesMode = false;
                        room.timed = false;
                        room.tokenDelay = 3000;
                        startGame();
                        update();
                    }
                },
                "start-game-timed": (user) => {
                    if (user === room.hostId) {
                        room.picturesMode = false;
                        room.timed = true;
                        room.tokenDelay = 1500;
                        startGame();
                        update();
                    }
                },
                "start-game-pictures": (user) => {
                    if (user === room.hostId) {
                        room.picturesMode = true;
                        room.timed = true;
                        room.tokenDelay = 1500;
                        startGame();
                        update();
                    }
                },
                "toggle-words-level": (user, level) => {
                    if (user === room.hostId && ~[0, 1, 2, 3].indexOf(level) && room.wordsLevel.filter((value, index) => index !== level && value).length > 0) {
                        words = [];
                        room.wordsLevel[level] = !room.wordsLevel[level];
                    }
                    update();
                },
                "toggle-traitor-mode": (user) => {
                    if (user === room.hostId)
                        room.traitorMode = !room.traitorMode;
                    update();
                },
                "set-master-time": (user, value) => {
                    if (user === room.hostId && parseInt(value))
                        room.masterTime = parseInt(value);
                    update();
                },
                "set-master-first-time": (user, value) => {
                    if (user === room.hostId && !isNaN(parseInt(value)))
                        room.masterFirstTime = parseInt(value);
                    update();
                },
                "set-team-time": (user, value) => {
                    if (user === room.hostId && parseInt(value))
                        room.teamTime = parseInt(value);
                    update();
                },
                "set-add-time": (user, value) => {
                    if (user === room.hostId && parseInt(value))
                        room.addTime = parseInt(value);
                    update();
                },
                "add-command": (user, color, command) => {
                    if (command && room.teamTurn === color)
                        addCommand(color, command);
                    update();
                },
                "edit-command": (user, command, index, color) => {
                    if (user === room.hostId && room[`${color}Commands`] && room[`${color}Commands`][index])
                        room[`${color}Commands`][index] = command;
                    update();
                },
                "stop-game": (user) => {
                    if (user === room.hostId)
                        room.teamsLocked = false;
                    update();
                },
                "toggle-pause": (user) => {
                    if (user === room.hostId) {
                        if (room.words.length === 0 || room.teamWin !== null)
                            startGame();
                        else
                            room.paused = !room.paused;
                    }
                    update();
                },
                "restart-game": (user) => {
                    if (user === room.hostId)
                        startGame();
                    update();
                },
                "skip-team": (user) => {
                    if (user === room.hostId) {
                        room.teamTurn = room.teamTurn !== "red" ? "red" : "blu";
                        room.hasCommand = false;
                        room.masterAdditionalTime = false;
                        startTeamTimer();
                        update();
                    }
                },
                "change-name": (user, value) => {
                    if (value)
                        room.playerNames[user] = value.substr && value.substr(0, 60);
                    update();
                },
                "remove-player": (user, playerId) => {
                    if (playerId && user === room.hostId) {
                        removePlayer(playerId);
                        if (room.onlinePlayers.has(playerId))
                            room.spectators.add(playerId);
                    }
                    update();
                },
                "remove-offline": (user) => {
                    if (user === room.hostId)
                        Object.keys(room.playerNames).forEach(playerId => {
                            if (!room.onlinePlayers.has(playerId))
                                removePlayer(playerId);
                        });
                    update();
                },
                "shuffle-players": (user) => {
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
                        [...room.blu].forEach((user) => {
                            sendMasterKey(user);
                        });
                        [...room.red].forEach((user) => {
                            sendMasterKey(user);
                        });
                        startGame();
                        update();
                    }
                },
                "give-host": (user, playerId) => {
                    if (playerId && user === room.hostId)
                        room.hostId = playerId;
                    update();
                },
                "team-join": (user, color, isMaster) => {
                    if (color === "red" || color === "blu") {
                        if (!isMaster) {
                            leaveTeams(user);
                            room[color].add(user)
                        }
                        else if (!room[`${color}Master`]) {
                            leaveTeams(user);
                            room[`${color}Master`] = user;
                        }
                        sendMasterKey(user);
                        update();
                    }
                },
                "spectators-join": (user) => {
                    leaveTeams(user);
                    room.spectators.add(user);
                    update();
                },
                "ping": (user) => {
                    room.onlinePlayers.add(user);
                    update();
                }
            };
        }
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
}

module.exports = init;