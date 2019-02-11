function init(wsServer, path) {
    const
        fs = require('fs'),
        express = require('express'),
        app = wsServer.app,
        registry = wsServer.users,
        EventEmitter = require("events"),
        randomColor = require('randomcolor'),
        channel = "codenames";

    let defaultCodeWords, engCodeWords;
    fs.readFile(__dirname + "/words.json", "utf8", function (err, words) {
        defaultCodeWords = JSON.parse(words);
    });
    fs.readFile(__dirname + "/words-en.json", "utf8", function (err, words) {
        engCodeWords = JSON.parse(words);
    });
    const defaultCodePics = Array(278).fill().map((_, idx) => idx + 1);

    app.get(path, function (req, res) {
        res.sendFile(`${__dirname}/public/app.html`);
    });
    app.use("/codenames", express.static(`${__dirname}/public`));

    class GameState extends EventEmitter {
        constructor(hostId, hostData, userRegistry) {
            super();
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
                    grn: new JSONSet(),
                    key: [],
                    words: [],
                    redMaster: null,
                    bluMaster: null,
                    grnMaster: null,
                    redCommands: [],
                    bluCommands: [],
                    grnCommands: [],
                    redCount: null,
                    bluCount: null,
                    grnCount: null,
                    teamsLocked: false,
                    teamWin: null,
                    teamFailed: null,
                    teamTurn: null,
                    playerTokens: [],
                    tokenCountdown: null,
                    hasCommand: false,
                    redTime: 0,
                    bluTime: 0,
                    grnTime: 0,
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
                    traitorMode: false,
                    traitors: [],
                    authRequired: false,
                    wordsLevel: [false, true, false, false],
                    mode: "ru",
                    modeStarted: "ru",
                    turnOrder: [],
                    bigMode: false,
                    triMode: false,
                    cardSet: null
                },
                intervals = {};
            this.room = room;
            this.lastInteraction = new Date();
            const state = {
                traitors: {},
                masterKey: null,
                words: null,
                pics: null
            };
            this.state = state;
            const
                send = (target, event, data) => userRegistry.send(target, event, data),
                update = () => send(room.onlinePlayers, "state", room),
                leaveTeams = (user) => {
                    room.playerTokens = [];
                    room.red.delete(user);
                    room.blu.delete(user);
                    room.grn.delete(user);
                    room.spectators.delete(user);
                    if (room.redMaster === user)
                        room.redMaster = null;
                    else if (room.bluMaster === user)
                        room.bluMaster = null;
                    else if (room.grnMaster === user)
                        room.grnMaster = null;
                    send(user, "masterKey", {key: null, traitor: null});
                },
                joinSpectators = (user) => {
                    if (user) {
                        leaveTeams(user);
                        room.spectators.add(user);
                    }
                },
                clearGrnTeam = () => {
                    [...room.grn].forEach(joinSpectators);
                    joinSpectators(room.grnMaster);
                },
                removePlayer = (playerId) => {
                    room.red.delete(playerId);
                    room.blu.delete(playerId);
                    if (room.bluMaster === playerId)
                        room.bluMaster = null;
                    else if (room.redMaster === playerId)
                        room.redMaster = null;
                    else if (room.grnMaster === playerId)
                        room.grnMaster = null;
                    room.playerTokens = [];
                    if (room.spectators.has(playerId) || !room.onlinePlayers.has(playerId)) {
                        room.spectators.delete(playerId);
                        delete room.playerNames[playerId];
                        registry.disconnect(playerId, "You was removed");
                    } else
                        room.spectators.add(playerId);
                },
                dealWords = () => {
                    state.words = state.words || [];
                    state.pics = state.pics || [];
                    const wordsCount = room.bigMode ? 36 : 25;
                    if (room.mode !== "pic") {
                        if (state.words.length < wordsCount) {
                            state.words = [];
                            room.wordsLevel.forEach((value, index) => {
                                if (value)
                                    state.words = room.mode !== "en" ? state.words.concat(defaultCodeWords[index]) : state.words.concat(engCodeWords[0]);
                            });
                            shuffleArray(state.words);
                        }
                        room.words = state.words.splice(0, wordsCount);
                    } else {
                        if (state.pics.length < wordsCount)
                            state.pics = shuffleArray(defaultCodePics.slice());
                        room.words = state.pics.splice(0, wordsCount);
                    }
                    room.key = [];
                    room.turnOrder = shuffleArray(room.triMode ? ["red", "blu", "grn"] : ["red", "blu"]);
                    const
                        cardSet = room.cardSet || {
                            goal: !room.bigMode ? 8 : (room.triMode ? 8 : 11),
                            ext1: room.triMode ? 2 : 1,
                            ext2: room.triMode ? 1 : 0,
                            black: 1
                        },
                        whiteCount = (room.bigMode ? 36 : 25) - Object.keys(cardSet).reduce((prev, cur) =>
                            prev + (cur === "goal" ? (room.triMode ? 3 : 2) * cardSet[cur] : cardSet[cur]), 0);
                    state.masterKey = shuffleArray([]
                        .concat(Array.apply(null, new Array(cardSet.goal)).map(() => "red"))
                        .concat(Array.apply(null, new Array(cardSet.goal)).map(() => "blu"))
                        .concat(Array.apply(null, new Array(room.triMode ? cardSet.goal : 0)).map(() => "grn"))
                        .concat(Array.apply(null, new Array(cardSet.ext1)).map(() => (room.teamTurn = room.turnOrder[0])))
                        .concat(Array.apply(null, new Array(cardSet.ext2)).map(() => (room.turnOrder[1])))
                        .concat(Array.apply(null, new Array(whiteCount)).map(() => "white"))
                        .concat(Array.apply(null, new Array(cardSet.black)).map(() => "black")));
                    room.passIndex = room.words.length + 1;
                    room.modeStarted = room.mode;
                    [room.redMaster, room.bluMaster, room.grnMaster, state.traitors.blu, state.traitors.red].forEach((user) => {
                        sendMasterKey(user);
                    });
                },
                updateCount = () => {
                    room.redCount = state.masterKey.filter(card => card === "red").length - room.key.filter(card => card === "red").length;
                    room.bluCount = state.masterKey.filter(card => card === "blu").length - room.key.filter(card => card === "blu").length;
                    room.grnCount = state.masterKey.filter(card => card === "grn").length - room.key.filter(card => card === "grn").length;
                },
                endGame = () => {
                    room.paused = true;
                    room.teamsLocked = false;
                    room.traitors = [state.traitors.blu, state.traitors.red];
                    clearInterval(intervals.team);
                    clearInterval(intervals.move);
                    intervals.team = undefined;
                    room.redTime = 0;
                    room.bluTime = 0;
                    room.grnTime = 0;
                    room.time = null;
                    room.key = state.masterKey;
                },
                startGame = () => {
                    room.paused = false;
                    room.teamsLocked = true;
                    room.teamFailed = null;
                    room.redCommands = [];
                    room.bluCommands = [];
                    room.grnCommands = [];
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
                        state.traitors = {
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
                                        word.votes += [...room[room.teamTurn]].length - usedTokens;
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
                getNextTeam = () => {
                    let nextTeam = room.turnOrder.indexOf(room.teamTurn) + 1;
                    if (!room.turnOrder[nextTeam])
                        nextTeam = 0;
                    if (room.teamFailed === room.turnOrder[nextTeam])
                        nextTeam++;
                    if (!room.turnOrder[nextTeam])
                        nextTeam = 0;
                    return room.turnOrder[nextTeam];
                },
                chooseWord = (index) => {
                    if (index === room.passIndex || state.masterKey[index] !== room.teamTurn) {
                        if (room.triMode && state.masterKey[index] === "black")
                            if (!room.teamFailed)
                                room.teamFailed = room.teamTurn;
                            else
                                room.teamWin = getNextTeam();
                        room.teamTurn = getNextTeam();
                        room.hasCommand = false;
                        if (room.timed)
                            startMasterTimer();
                    } else room.time += room.addTime * 1000;
                    if (index !== room.passIndex) {
                        room.key[index] = state.masterKey[index];
                        updateCount();
                        if (room.teamWin || (room.key[index] === "black" && !room.triMode)
                            || room.bluCount === 0 || room.redCount === 0 || (room.triMode && room.grnCount === 0)) {
                            if (!room.triMode)
                                room.teamWin = room.teamTurn;
                            else {
                                if (room.redCount === 0)
                                    room.teamWin = "red";
                                else if (room.bluCount === 0)
                                    room.teamWin = "blu";
                                else if (room.grnCount === 0)
                                    room.teamWin = "grn";
                            }
                            endGame();
                        }
                    }
                    room.tokenCountdown = null;
                    room.playerTokens = [];
                    update();
                    send(room.onlinePlayers, "highlight-word", {index});
                },
                tokenChanged = (index) => {
                    if ([...room[room.teamTurn]].length === (room.playerTokens[index] && room.playerTokens[index].size)) {
                        intervals.token = setTimeout(() => {
                            chooseWord(index);
                        }, room.tokenDelay);
                        room.tokenCountdown = index;
                    } else {
                        clearTimeout(intervals.token);
                        room.tokenCountdown = null;
                    }
                },
                sendMasterKey = (user) => {
                    if (room.onlinePlayers.has(user)) {
                        if (room.redMaster === user || room.bluMaster === user || room.grnMaster === user)
                            send(user, "masterKey", {
                                key: state.masterKey,
                                traitor: room.redMaster === user ? state.traitors.blu : state.traitors.red
                            });
                        else if (state.traitors.blu === user)
                            send(user, "masterKey", {
                                key: state.masterKey.map((color) => ~["red", "black"].indexOf(color) ? color : "none"),
                                traitor: user
                            });
                        else if (state.traitors.red === user)
                            send(user, "masterKey", {
                                key: state.masterKey.map((color) => ~["blu", "black"].indexOf(color) ? color : "none"),
                                traitor: user
                            });
                        else
                            send(user, "masterKey", {key: null, traitor: null});
                    }
                },
                userJoin = (data) => {
                    const user = data.userId;
                    if (!room.playerNames[user])
                        room.spectators.add(user);
                    room.onlinePlayers.add(user);
                    room.playerNames[user] = data.userName.substr && data.userName.substr(0, 60);
                    room.playerColors[user] = room.playerColors[user] || randomColor();
                    sendMasterKey(user);
                    update();
                },
                userLeft = (user) => {
                    room.onlinePlayers.delete(user);
                    if (room.spectators.has(user))
                        delete room.playerNames[user];
                    room.spectators.delete(user);
                    if (room.onlinePlayers.size === 0) {
                        clearInterval(intervals.team);
                        clearInterval(intervals.move);
                        room.paused = true;
                    }
                    update();
                },
                userEvent = (user, event, data) => {
                    this.lastInteraction = new Date();
                    try {
                        if (this.eventHandlers[event])
                            this.eventHandlers[event](user, data[0], data[1], data[2]);
                    } catch (error) {
                        console.error(error);
                        registry.log(error.message);
                    }
                };
            this.userJoin = userJoin;
            this.userLeft = userLeft;
            this.userEvent = userEvent;
            this.eventHandlers = {
                "word-click": (user, wordIndex) => {
                    if (room.hasCommand && ((room.red.has(user) && room.teamTurn === "red")
                        || (room.blu.has(user) && room.teamTurn === "blu")
                        || (room.grn.has(user) && room.teamTurn === "grn")) && !room.key[wordIndex]) {
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
                    if (room.red.has(user) || room.blu.has(user) || room.grn.has(user))
                        send(room.onlinePlayers, "highlight-word", {index: wordIndex, user});
                },
                "change-color": (user) => {
                    room.playerColors[user] = randomColor();
                    update();
                },
                "toggle-lock": (user) => {
                    if (user === room.hostId)
                        room.teamsLocked = !room.teamsLocked;
                    update();
                },
                "start-game": (user) => {
                    if (user === room.hostId) {
                        room.bigMode = false;
                        room.triMode = false;
                        room.cardSet = null;
                        clearGrnTeam();
                        startGame();
                        update();
                    }
                },
                "start-game-tri": (user) => {
                    if (user === room.hostId) {
                        room.bigMode = true;
                        room.triMode = true;
                        room.traitorMode = false;
                        room.cardSet = null;
                        startGame();
                        update();
                    }
                },
                "start-game-custom": (user, settings) => {
                    if (user === room.hostId && settings.cardSet && settings.cardSet.goal) {
                        const whiteCount = (settings.bigMode ? 36 : 25) - Object.keys(settings.cardSet).reduce((prev, cur) =>
                            prev + (cur === "goal" ? (settings.triMode ? 3 : 2) * settings.cardSet[cur] : settings.cardSet[cur]), 0);
                        if (settings.cardSet.goal > 0 && whiteCount >= 0) {
                            if (!settings.triMode)
                                clearGrnTeam();
                            room.cardSet = settings.cardSet;
                            room.bigMode = settings.bigMode;
                            room.triMode = settings.triMode;
                            room.traitorMode = false;
                            startGame();
                            update();
                        }
                    }
                },
                "toggle-words-level": (user, level) => {
                    if (user === room.hostId && ~[0, 1, 2, 3].indexOf(level) && room.wordsLevel.filter((value, index) => index !== level && value).length > 0) {
                        state.words = [];
                        room.wordsLevel[level] = !room.wordsLevel[level];
                    }
                    update();
                },
                "toggle-words-mode": (user) => {
                    if (user === room.hostId) {
                        state.words = [];
                        let
                            modeList = ["ru", "en", "pic"],
                            nextMode = modeList.indexOf(room.mode) + 1;
                        if (!modeList[nextMode])
                            nextMode = 0;
                        room.mode = modeList[nextMode];
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
                        room.teamTurn = getNextTeam();
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
                    if (playerId && user === room.hostId)
                        removePlayer(playerId);
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
                        players = players.concat([...room.grn]);
                        if (room.redMaster)
                            players.push(room.redMaster);
                        if (room.bluMaster)
                            players.push(room.bluMaster);
                        if (room.grnMaster)
                            players.push(room.grnMaster);
                        shuffleArray(players);
                        room.redMaster = players.shift();
                        room.bluMaster = players.shift();
                        if (room.triMode)
                            room.grnMaster = players.shift();
                        if (!room.triMode) {
                            room.red = new JSONSet(players.splice(0, Math.ceil(players.length / 2)));
                            room.blu = new JSONSet(players);
                        } else {
                            room.red = new JSONSet(players.splice(0, Math.ceil(players.length / 3)));
                            room.blu = new JSONSet(players.splice(0, Math.ceil(players.length / 2)));
                            room.grn = new JSONSet(players);
                        }
                        [...room.blu].forEach((user) => {
                            sendMasterKey(user);
                        });
                        [...room.red].forEach((user) => {
                            sendMasterKey(user);
                        });
                        [...room.grn].forEach((user) => {
                            sendMasterKey(user);
                        });
                        startGame();
                        update();
                    }
                },
                "give-host": (user, playerId) => {
                    if (playerId && user === room.hostId) {
                        room.hostId = playerId;
                        this.emit("host-changed", user, playerId);
                    }
                    update();
                },
                "team-join": (user, color, isMaster) => {
                    if (color === "red" || color === "blu" || (room.triMode && color === "grn")) {
                        if (!isMaster) {
                            leaveTeams(user);
                            room[color].add(user)
                        } else if (!room[`${color}Master`]) {
                            leaveTeams(user);
                            room[`${color}Master`] = user;
                        }
                        sendMasterKey(user);
                        update();
                    }
                },
                "spectators-join": (user) => {
                    joinSpectators(user);
                    update();
                }
            };
        }

        getPlayerCount() {
            return Object.keys(this.room.playerNames).length;
        }

        getActivePlayerCount() {
            return this.room.onlinePlayers.size;
        }

        getLastInteraction() {
            return this.lastInteraction;
        }

        getSnapshot() {
            return {
                room: this.room,
                state: {
                    traitors: this.state.traitors,
                    masterKey: this.state.masterKey
                }
            };
        }

        setSnapshot(snapshot) {
            Object.assign(this.room, snapshot.room);
            Object.assign(this.state, snapshot.state);
            this.room.paused = true;
            this.room.onlinePlayers = new JSONSet();
            this.room.spectators = new JSONSet(this.room.spectators);
            this.room.red = new JSONSet(this.room.red);
            this.room.blu = new JSONSet(this.room.blu);
            this.room.grn = new JSONSet(this.room.grn);
            this.room.playerTokens = [];
            this.room.onlinePlayers.clear();
        }
    }

    function shuffleArray(array) {
        let currentIndex = array.length, temporaryValue, randomIndex;
        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
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

    registry.createRoomManager(path, channel, GameState);
}

module.exports = init;