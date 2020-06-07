function init(wsServer, path) {
    const
        fs = require('fs'),
        express = require('express'),
        app = wsServer.app,
        registry = wsServer.users,
        randomColor = require('randomcolor'),
        channel = "codenames";

    let defaultCodeWords, engCodeWords;
    fs.readFile(`${__dirname}/words.json`, "utf8", function (err, words) {
        defaultCodeWords = JSON.parse(words);
        fs.readFile(`${registry.config.appDir || __dirname}/moderated-words.json`, "utf8", function (err, words) {
            if (words) {
                let moderatedWords = JSON.parse(words);
                moderatedWords[0] = defaultCodeWords[0];
                defaultCodeWords = moderatedWords;
            }
        });
    });
    fs.readFile(__dirname + "/words-en.json", "utf8", function (err, words) {
        engCodeWords = JSON.parse(words);
    });
    const defaultCodePics = Array(278).fill().map((_, idx) => idx + 1);

    registry.handleAppPage(path, `${__dirname}/public/app.html`);

    app.use("/codenames", express.static(`${__dirname}/public`));

    class GameState extends wsServer.users.RoomState {
        constructor(hostId, hostData, userRegistry) {
            super(hostId, hostData, userRegistry);
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
                    wordsLevel: 1,
                    mode: "ru",
                    modeStarted: "ru",
                    turnOrder: [],
                    bigMode: false,
                    triMode: false,
                    cardSet: null,
                    crowdMode: false,
                    redCrowd: 0,
                    bluCrowd: 0,
                    grnCrowd: 0,
                    spectatorsCrowd: 0,
                    crowdTokens: [],
                    masterPlayers: new JSONSet()
                },
                intervals = {};
            this.room = room;
            this.lastInteraction = new Date();
            const state = {
                traitors: {},
                masterKey: null,
                words: null,
                pics: null,
                tokenPerPlayer: {},
                redCrowdPlayers: new JSONSet(),
                bluCrowdPlayers: new JSONSet(),
                grnCrowdPlayers: new JSONSet(),
                spectatorsCrowdPlayers: new JSONSet()
            };
            this.state = state;
            const
                send = (target, event, data) => userRegistry.send(target, event, data),
                update = () => send(room.onlinePlayers, "state", room),
                leaveTeams = (user, keepSpectator) => {
                    room.playerTokens[state.tokenPerPlayer] && room.playerTokens[state.tokenPerPlayer].delete(user);
                    ["red", "blu", "grn"].forEach((color) => {
                        room[color].delete(user);
                        if (state[`${color}CrowdPlayers`].delete(user))
                            room[`${color}Crowd`]--;
                        if (room[`${color}Master`] === user)
                            room[`${color}Master`] = null;
                    });
                    if (!keepSpectator)
                        room.spectators.delete(user);
                    if (room.crowdMode && !room.masterPlayers.has(user))
                        if (!keepSpectator)
                            state.spectatorsCrowdPlayers.delete(user);
                        else
                            state.spectatorsCrowdPlayers.add(user);
                    room.spectatorsCrowd = state.spectatorsCrowdPlayers.size;
                    send(user, "masterKey", {key: null, traitor: null});
                },
                joinSpectators = (user, initial) => {
                    if (user) {
                        if (!initial)
                            leaveTeams(user);
                        if (room.crowdMode && !room.masterPlayers.has(user)) {
                            state.spectatorsCrowdPlayers.add(user);
                            room.spectatorsCrowd = state.spectatorsCrowdPlayers.size;
                            if (!initial)
                                send(user, "crowd-joined", null);
                        } else {
                            if (room.onlinePlayers.has(user))
                                room.spectators.add(user);
                        }
                    }
                },
                clearGrnTeam = () => {
                    [...room.grn].forEach(joinSpectators);
                    joinSpectators(room.grnMaster);
                },
                removePlayer = (playerId) => {
                    leaveTeams(playerId, true);
                    if (room.spectators.has(playerId) || !room.onlinePlayers.has(playerId)) {
                        room.spectators.delete(playerId);
                        delete room.playerNames[playerId];
                        this.emit("user-kicked", playerId);
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
                            state.words = ["ru", "alias"].includes(room.mode)
                                ? state.words.concat(defaultCodeWords[room.wordsLevel])
                                : state.words.concat(engCodeWords[0]);
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
                    [...room.onlinePlayers].forEach((user) => {
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
                    if (!room.crowdMode)
                        room.teamsLocked = true;
                    room.teamFailed = null;
                    room.redCommands = [];
                    room.bluCommands = [];
                    room.grnCommands = [];
                    room.playerTokens = [];
                    room.crowdTokens = [];
                    state.tokenPerPlayer = {};
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
                                let votedWords = [];
                                if (!room.crowdMode) {
                                    let usedTokens = 0;
                                    room.playerTokens[room.passIndex] = room.playerTokens[room.passIndex] || new JSONSet();
                                    room.playerTokens.forEach((players, index) => {
                                        const word = {index: index, votes: players.size};
                                        usedTokens += players.size;
                                        if (index === room.passIndex)
                                            word.votes += [...room[room.teamTurn]].length - usedTokens;
                                        votedWords.push(word);
                                    });
                                } else {
                                    votedWords = room.crowdTokens.map((votes, index) => ({
                                        votes, index
                                    }));
                                }
                                const
                                    sorted = votedWords.sort((a, b) => b.votes - a.votes),
                                    mostVoted = sorted && sorted[0] && (!sorted[1] || (sorted[0].votes > sorted[1].votes));
                                chooseWord(mostVoted ? sorted[0].index : room.passIndex);

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
                    room.crowdTokens = [];
                    state.tokenPerPlayer = {};
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
                getAllPlayers = () => {
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
                    return players;
                },
                isUserTurn = (user) => {
                    if (!room.crowdMode)
                        return (room.red.has(user) && room.teamTurn === "red")
                            || (room.blu.has(user) && room.teamTurn === "blu")
                            || (room.grn.has(user) && room.teamTurn === "grn");
                    else
                        return (state.redCrowdPlayers.has(user) && room.teamTurn === "red")
                            || (state.bluCrowdPlayers.has(user) && room.teamTurn === "blu")
                            || (state.grnCrowdPlayers.has(user) && room.teamTurn === "grn");
                },
                userJoin = (data) => {
                    const user = data.userId;
                    room.onlinePlayers.add(user);
                    if (data.masterToken === state.masterToken)
                        room.masterPlayers.add(user);
                    if (!room.crowdMode || room.masterPlayers.has(user)) {
                        if (!room.playerNames[user])
                            joinSpectators(user, true);
                        sendMasterKey(user);
                        room.playerNames[user] = data.userName.substr && data.userName.substr(0, 60);
                        room.playerColors[user] = data.userColor || room.playerColors[user] || randomColor();
                    } else {
                        let playerHasTeam = false;
                        ["red", "blu", "grn"].forEach((color) => {
                            if (state[`${color}CrowdPlayers`].has(user)) {
                                playerHasTeam = true;
                                room[`${color}Crowd`]++;
                                send(user, "crowd-joined", color);
                            }
                        });
                        if (!playerHasTeam)
                            joinSpectators(user, true);
                    }
                    update();
                    if (room.crowdMode && room.hostId === user)
                        send(user, "master-token", state.masterToken);
                },
                userLeft = (user) => {
                    room.onlinePlayers.delete(user);
                    if (room.spectators.has(user))
                        delete room.playerNames[user];
                    room.spectators.delete(user);
                    state.spectatorsCrowdPlayers.delete(user);
                    room.spectatorsCrowd = state.spectatorsCrowdPlayers.size;
                    if (room.crowdMode && !room.masterPlayers.has(user))
                        ["red", "blu", "grn"].forEach((color) => {
                            if (state[`${color}CrowdPlayers`].has(user))
                                room[`${color}Crowd`]--;
                        });
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
                    if (room.hasCommand && isUserTurn(user) && !room.key[wordIndex]) {
                        if (!room.crowdMode) {
                            room.playerTokens[wordIndex] = room.playerTokens[wordIndex] || new JSONSet();
                            if (state.tokenPerPlayer[user] != null) {
                                room.playerTokens[state.tokenPerPlayer[user]].delete(user);
                                tokenChanged(state.tokenPerPlayer[user]);
                            }
                            if (state.tokenPerPlayer[user] !== wordIndex) {
                                room.playerTokens[wordIndex].add(user);
                                state.tokenPerPlayer[user] = wordIndex;
                                tokenChanged(wordIndex);
                            } else
                                delete state.tokenPerPlayer[user];
                        } else {
                            room.crowdTokens[wordIndex] = room.crowdTokens[wordIndex] || 0;
                            if (state.tokenPerPlayer[user] != null) {
                                room.crowdTokens[state.tokenPerPlayer[user]]--;
                            }
                            if (state.tokenPerPlayer[user] !== wordIndex) {
                                room.crowdTokens[wordIndex]++;
                                state.tokenPerPlayer[user] = wordIndex;
                                if ([...state[`${room.teamTurn}CrowdPlayers`]]
                                    .filter(user => room.onlinePlayers.has(user)).length === room.crowdTokens[wordIndex])
                                    chooseWord(wordIndex);
                            } else
                                delete state.tokenPerPlayer[user];
                        }
                        update();
                    }
                    if (!room.crowdMode && (room.red.has(user) || room.blu.has(user) || room.grn.has(user)))
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
                    if (user === room.hostId && ~[0, 1, 2, 3].indexOf(level)) {
                        state.words = [];
                        room.wordsLevel = level;
                    }
                    update();
                },
                "toggle-words-mode": (user) => {
                    if (user === room.hostId) {
                        state.words = [];
                        let
                            modeList = ["ru", "en", "pic", "alias"],
                            nextMode = modeList.indexOf(room.mode) + 1;
                        if (!modeList[nextMode])
                            nextMode = 0;
                        room.wordsLevel = 1;
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
                    if (command && !room.hasCommand && room.teamTurn === color && room[`${color}Master`] === user)
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
                        const players = getAllPlayers();
                        shuffleArray(players);
                        room.redMaster = players.shift() || null;
                        room.bluMaster = players.shift() || null;
                        if (room.triMode)
                            room.grnMaster = players.shift() || null;
                        if (!room.triMode) {
                            room.red = new JSONSet(players.splice(0, Math.ceil(players.length / 2)));
                            room.blu = new JSONSet(players);
                        } else {
                            room.red = new JSONSet(players.splice(0, Math.ceil(players.length / 3)));
                            room.blu = new JSONSet(players.splice(0, Math.ceil(players.length / 2)));
                            room.grn = new JSONSet(players);
                        }
                        startGame();
                        update();
                    }
                },
                "enable-crowd-mode": (user) => {
                    if (user === room.hostId && !room.crowdMode) {
                        room.crowdMode = true;
                        room.masterPlayers = new JSONSet(getAllPlayers().concat([...room.spectators]));
                        [...room.red].forEach(joinSpectators);
                        [...room.blu].forEach(joinSpectators);
                        [...room.grn].forEach(joinSpectators);
                        room.teamTime = 10;
                        room.addTime = 6;
                        room.teamsLocked = false;
                        room.timed = true;
                        state.masterToken = userRegistry.registry.makeId();
                        send(user, "master-token", state.masterToken);
                        startGame();
                        update();
                    }
                },
                "give-host": (user, playerId) => {
                    if (playerId && user === room.hostId) {
                        room.hostId = playerId;
                        send(playerId, "master-token", state.masterToken);
                        this.emit("host-changed", user, playerId);
                    }
                    update();
                },
                "team-join": (user, color, isMaster) => {
                    if (!room.teamsLocked && (color === "red" || color === "blu" || (room.triMode && color === "grn"))) {
                        if (!isMaster) {
                            if (room.crowdMode && (room.masterPlayers.has(user)
                                || (!state.spectatorsCrowdPlayers.has(user) && room.teamWin === null)))
                                return;
                            leaveTeams(user);
                            if (room.crowdMode) {
                                room[`${color}Crowd`]++;
                                state[`${color}CrowdPlayers`].add(user);
                                send(user, "crowd-joined", color);
                            } else
                                room[color].add(user);
                        } else if (!room[`${color}Master`]) {
                            if (room.crowdMode && !room.masterPlayers.has(user))
                                return;
                            leaveTeams(user);
                            room[`${color}Master`] = user;
                        }
                        sendMasterKey(user);
                        update();
                    }
                },
                "spectators-join": (user) => {
                    if (room.crowdMode && !room.masterPlayers.has(user) && room.teamWin === null)
                        return;
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
            this.room.spectators = new JSONSet();
            this.room.red = new JSONSet(this.room.red);
            this.room.blu = new JSONSet(this.room.blu);
            this.room.grn = new JSONSet(this.room.grn);
            this.state.redCrowdPlayers = new JSONSet(this.state.redCrowdPlayers);
            this.state.bluCrowdPlayers = new JSONSet(this.state.bluCrowdPlayers);
            this.state.grnCrowdPlayers = new JSONSet(this.state.grnCrowdPlayers);
            this.state.spectatorsCrowdPlayers = new JSONSet(this.state.spectatorsCrowdPlayers);
            this.room.playerTokens = [];
            this.room.crowdTokens = [];
            this.state.tokenPerPlayer = {};
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
