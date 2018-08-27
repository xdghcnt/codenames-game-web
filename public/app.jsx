//import React from "react";
//import ReactDOM from "react-dom"
//import io from "socket.io"
function makeId() {
    let text = "";
    const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < 5; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

class Words extends React.Component {
    render() {
        const
            data = this.props.data,
            handleWordClick = this.props.handleWordClick,
            handleWordPress = this.props.handleWordPress;
        return (
            <div className="words">
                {data.words.map((word, index) => (
                    <div data={data}
                         onClick={() => handleWordClick(index)}
                         onMouseDown={() => handleWordPress(index)}
                         className={
                             "word"
                             + (data.key[index] ? ` word-guessed word-${data.key[index]}` : "")
                             + ((data.masterKey && !data.key[index]) ? ` word-${data.masterKey[index]}` : "")
                         }>
                        <div className="word-box" data-wordIndex={index}>
                            <span>{data.picturesMode ? (
                                <img src={`pictures/pic${word}.png`}/>) : word && window.hyphenate(word)}</span>
                            <div className="player-tokens">
                                {data.playerTokens[index] && data.playerTokens[index].filter(player => player).map(
                                    player => (
                                        <div className="player-token" style={{background: data.playerColors[player]}}/>)
                                )}
                            </div>
                            <div className={
                                "token-countdown"
                                + (data.tokenCountdown === index ? " active" : "")
                                + " " + (data.teamTurn)}
                                 style={{"transition-duration": `${data.tokenDelay / 1000}s`}}/>
                        </div>
                    </div>
                ))}
            </div>
        );
    }
}

class Team extends React.Component {
    render() {
        const
            data = this.props.data,
            color = this.props.color,
            handleJoinClick = this.props.handleJoinClick,
            handleAddCommandClick = this.props.handleAddCommandClick,
            handlePassClick = this.props.handlePassClick,
            master = data[color + "Master"],
            userInTeam = ~data[color].indexOf(data.userId),
            passValue = data.words.length + 1,
            time = new Date(data.timed ? ((data.teamTurn === color ? data.time : (data.masterTime * 1000))) : data[`${color}Time`]) || 0,
            timeWarning = time !== 0 && time < 6000,
            isTeamTurn = data.teamTurn === color;
        return (
            <div className={`team ${color}`}>
                <div className="master" onClick={() => handleJoinClick(color, true)}>
                    {data.teamTurn === color ? (<span className={
                        "move-arrow"
                        + (data.hasCommand ? " has-command" : "")
                    }>➜</span>) : ""}
                    {
                        !!master
                            ? (<Player key={master} data={data} id={master}
                                       handleGiveHost={this.props.handleGiveHost}
                                       handleRemovePlayer={this.props.handleRemovePlayer}
                                       handleChangeColor={this.props.handleChangeColor}/>)
                            : !data.teamsLocked ? (
                                <div className="join-placeholder">Become master</div>) : "Nothing here"
                    }
                </div>
                <div className="player-container" onClick={() => handleJoinClick(color)}>
                    {
                        data[color].map(
                            player => (<Player key={player} data={data} id={player}
                                               handleGiveHost={this.props.handleGiveHost}
                                               handleRemovePlayer={this.props.handleRemovePlayer}
                                               handleChangeColor={this.props.handleChangeColor}/>)
                        )
                    }
                    {data.teamsLocked || ~data[color].indexOf(data.userId) ? ("")
                        : (
                            <div className="join-placeholder">Join team</div>
                        )}
                </div>
                {data[`${color}Count`] !== null ? (
                    <div className="cards-count">
                        {data[`${color}Count`]}
                    </div>
                ) : ""}
                {data[`${color}Commands`].length || (data.timed && data.time !== null) || (data.userId === master && userInTeam && data.teamTurn === color) ? (
                    <div className="commands-container">
                        <div className="commands-title">
                            Log
                            <div className={
                                "timer"
                                + ((isTeamTurn && data.timed && timeWarning && (data.masterAdditionalTime || data.hasCommand)) ? (" critical") : "")
                                + ((isTeamTurn && data.timed && !data.hasCommand && (data.masterAdditionalTime || timeWarning) ? " additional" : ""))
                            }>
                                <span className="timer-time">
                                    {time.toUTCString().match(/(\d\d:\d\d )/)[0].trim()}
                                </span>
                                <i className="material-icons timer-button">alarm</i>
                            </div>
                        </div>
                        {
                            data[`${color}Commands`].map(
                                (command, index) => (<div className="command">{command}{data.hostId === data.userId ? (
                                    <div className="player-host-controls">
                                        <i className="material-icons host-button"
                                           title="Edit"
                                           onClick={(evt) => this.props.handleEditCommand(command, index, color, evt)}>
                                            edit
                                        </i>
                                    </div>) : ""}</div>)
                            )
                        }
                    </div>
                ) : ""}
                {!data.hasCommand && data.userId === master && data.teamTurn === color ? (
                    <div className="add-command">
                        <input className="add-command-input" id="command-input"
                               onKeyDown={(evt) => evt.key === "Enter" && handleAddCommandClick(color)}/>
                        <div className="add-command-button" onClick={() => handleAddCommandClick(color)}>+</div>
                    </div>
                ) : ""}
                {userInTeam && data.hasCommand && data.teamTurn === color && data.userId !== master ? (
                    <div className="pass-button" onClick={() => handlePassClick(passValue)}>
                        <div className="pass-button-title">End turn</div>
                        <div className="player-tokens">
                            {data.playerTokens[passValue] && data.playerTokens[passValue].filter(player => player).map(
                                player => (
                                    <div className="player-token" style={{background: data.playerColors[player]}}/>)
                            )}
                        </div>
                        <div className={
                            "token-countdown"
                            + ((data.tokenCountdown === passValue && data.teamTurn === color) ? " active" : "")
                            + " " + (data.teamTurn)}
                             style={{"transition-duration": `${data.tokenDelay / 1000}s`}}/>
                    </div>
                ) : ""}
            </div>
        );
    }
}

class Player extends React.Component {
    render() {
        const
            data = this.props.data,
            id = this.props.id;
        return (
            <div className={
                "player"
                + (!~data.onlinePlayers.indexOf(id) ? " offline" : "")
                + (id === data.userId ? " self" : "")
            }
                 data-playerId={id}>
                <div className="player-color" style={{background: data.playerColors[id]}}
                     onClick={(evt) => !evt.stopPropagation() && (id === data.userId) && this.props.handleChangeColor()}/>
                {data.playerNames[id]}
                {((~data.traitors.indexOf(id)) || data.masterTraitor === id) ? (
                    <div className="traitor-icon">
                        <i className="material-icons host-button inactive"
                           title="Traitor">
                            offline_bolt
                        </i>

                    </div>
                ) : ""}
                <div className="player-host-controls">
                    {(data.hostId === data.userId && data.userId !== id) ? (
                        <i className="material-icons host-button"
                           title="Give host"
                           onClick={(evt) => this.props.handleGiveHost(id, evt)}>
                            vpn_key
                        </i>
                    ) : ""}
                    {(data.hostId === data.userId && data.userId !== id) ? (
                        <i className="material-icons host-button"
                           title="Remove"
                           onClick={(evt) => this.props.handleRemovePlayer(id, evt)}>
                            delete_forever
                        </i>
                    ) : ""}
                    {(data.hostId === id) ? (
                        <i className="material-icons host-button inactive"
                           title="Game host">
                            stars
                        </i>
                    ) : ""}
                </div>
            </div>
        );
    }
}

class Spectators extends React.Component {
    render() {
        const
            data = this.props.data,
            handleSpectatorsClick = this.props.handleSpectatorsClick;
        return (
            <div
                onClick={handleSpectatorsClick}
                className={
                    "spectators"
                    + (data.phase !== 0 ? " started" : " not-started")
                }>
                Spectators:
                {
                    data.spectators.length ? data.spectators.map(
                        (player, index) => (<Player key={index} data={data} id={player}
                                                    handleChangeColor={this.props.handleChangeColor}
                                                    handleRemovePlayer={this.props.handleRemovePlayer}
                                                    handleGiveHost={this.props.handleGiveHost}/>)
                    ) : " ..."
                }
            </div>
        );
    }
}

class Game extends React.Component {
    componentDidMount() {
        const initArgs = {};
        if (!parseInt(localStorage.darkTheme))
            document.body.classList.add("dark-theme");
        if (!localStorage.userId) {
            while (!localStorage.userName)
                localStorage.userName = prompt("Your name");
            localStorage.userId = makeId();
        }
        if (!location.hash)
            location.hash = makeId();
        initArgs.roomId = location.hash.substr(1);
        initArgs.userId = this.userId = localStorage.userId;
        initArgs.userName = localStorage.userName;
        this.socket = io({
            transports: ['websocket']
        });
        this.socket.on("state", state => {
            if (this.state.hasCommand === false && state.hasCommand === true && !parseInt(localStorage.muteSounds))
                this.chimeSound.play();
            this.setState(Object.assign({
                userId: this.userId,
                masterKey: this.state.masterKey
            }, state));
            if (!~state.onlinePlayers.indexOf(this.userId))
                this.socket.emit("ping");
        });
        this.socket.on("masterKey", (masterKey, traitor) => {
            this.setState(Object.assign({}, this.state, {
                userId: this.userId,
                masterKey: masterKey,
                masterTraitor: traitor
            }));
        });
        this.socket.on("masterKeyUpdated", () => setTimeout(() => this.socket.emit("request-master-key"), 500));
        this.socket.on("message", text => {
            alert(text);
        });
        this.socket.on("disconnect", () => {
            this.setState({
                inited: false,
                disconnected: true
            });
        });
        this.socket.on("reload", () => {
            setTimeout(() => window.location.reload(), 3000);
        });
        this.socket.on("highlight-word", (wordIndex, playerId) => {
            const wordNode = document.querySelector(`[data-wordIndex='${wordIndex}']`);
            if (wordNode) {
                if (!parseInt(localStorage.muteSounds)) {
                    const
                        volR = (wordIndex % 5) / 4,
                        volL = 1 - volR;
                    this.tapSoundL.volume = Math.max(volL, 0.2) * 0.3;
                    this.tapSoundR.volume = Math.max(volR, 0.2) * 0.3;
                    this.tapSoundL.play();
                    this.tapSoundR.play();
                }
                wordNode.classList.add("highlight-anim");
                setTimeout(() => wordNode && wordNode.classList.remove("highlight-anim"), 0);
            }
            const playerNode = document.querySelector(`[data-playerId='${playerId}']`);
            if (playerNode) {
                playerNode.classList.add("highlight-anim");
                setTimeout(() => playerNode && playerNode.classList.remove("highlight-anim"), 0);
            }
        });
        this.socket.on("auth-required", () => {
            this.setState(Object.assign({}, this.state, {
                userId: this.userId,
                authRequired: true
            }));
            if (grecaptcha)
                grecaptcha.render("captcha-container", {
                    sitekey: "",
                    callback: (key) => this.socket.emit("auth", key, initArgs)
                });
            else
                setTimeout(() => window.location.reload(), 3000)
        });
        document.title = `Codenames - ${initArgs.roomId}`;
        this.socket.emit("init", initArgs);
        this.timerSound = new Audio("timer-beep.mp3");
        this.timerSound.volume = 0.5;
        this.tapSoundL = new Audio("tap_l.ogg");
        this.tapSoundR = new Audio("tap_r.ogg");
        this.chimeSound = new Audio("chime.mp3");
        this.chimeSound.volume = 0.25;
        window.hyphenate = createHyphenator(hyphenationPatternsRu);
    }

    constructor() {
        super();
        this.state = {
            inited: false
        };
    }

    handleWordClick(index) {
        this.socket.emit("word-click", index);
    }

    handleWordPress(index) {
        if (this.state.picturesMode) {
            this.wasReleased = false;
            setTimeout(() => {
                if (!this.wasReleased) {
                    const wordNode = document.querySelector(`[data-wordIndex='${index}']`);
                    wordNode.querySelector("img").src = `picturesBig/pic${this.state.words[wordNode.getAttribute("data-wordIndex")]}.png`;
                    wordNode.classList.add("zoomed");
                }
            }, 250);
        }
    }

    handleWordRelease() {
        if (this.state.picturesMode) {
            this.wasReleased = true;
            const wordNode = document.querySelector(".zoomed");
            if (wordNode) {
                wordNode.querySelector("img").src = `pictures/pic${this.state.words[wordNode.getAttribute("data-wordIndex")]}.png`;
                document.querySelector(".zoomed").classList.remove("zoomed");
            }
        }
    }

    handleJoinClick(color, isMaster) {
        if (!this.state.teamsLocked)
            this.socket.emit("team-join", color, isMaster);
    }

    handleAddCommandClick(color) {
        const input = document.getElementById("command-input");
        if (input && input.value)
            this.socket.emit("add-command", color, input.value);
    }

    handleSpectatorsClick() {
        if (!this.state.teamsLocked)
            this.socket.emit("spectators-join");
    }

    handleChangeColor() {
        this.socket.emit("change-color");
    }

    handleRemovePlayer(id, evt) {
        evt.stopPropagation();
        if (confirm(`Removing ${this.state.playerNames[id]}?`))
            this.socket.emit("remove-player", id);
    }

    handleGiveHost(id, evt) {
        evt.stopPropagation();
        if (confirm(`Give host ${this.state.playerNames[id]}?`))
            this.socket.emit("give-host", id);
    }

    handleEditCommand(command, index, color, evt) {
        evt.stopPropagation();
        const newCommand = prompt("Edit command", command);
        if (newCommand)
            this.socket.emit("edit-command", newCommand, index, color);
    }

    handleHostAction(evt) {
        const action = evt.target.className;
        if ((action === "start-game" || action === "start-game-timed") && (!this.state.teamsLocked || confirm("Restart? Are you sure?")))
            this.socket.emit(action);
        else if (action === "give-host")
            this.socket.emit("give-host", prompt("Nickname"));
        else if (action === "change-name") {
            const name = prompt("New name");
            this.socket.emit("change-name", name);
            localStorage.userName = name;
        }
        else if (action === "toggle-theme") {
            localStorage.darkTheme = !parseInt(localStorage.darkTheme) ? 1 : 0;
            document.body.classList.toggle("dark-theme");
        }
        else if (action === "set-master-time" || action === "set-team-time" || action === "set-add-time")
            this.socket.emit(action, prompt("Time in seconds"));
        else if (action !== "start-game" && action !== "start-game-timed")
            this.socket.emit(action);
    }

    handleChangeTime(value, type) {
        this.socket.emit(type, value);
    }

    handleClickChangeName() {
        const name = prompt("New name");
        this.socket.emit("change-name", name);
        localStorage.userName = name;
    }

    handleClickShuffle() {
        this.socket.emit("shuffle-players");
    }

    handleClickStart(mode) {
        if (this.state.words.length === 0 || this.state.teamWin || confirm("Restart? Are you sure?"))
            this.socket.emit(mode);
    }

    handleClickRestart() {
        if (this.state.words.length === 0 || this.state.teamWin || confirm("Restart? Are you sure?"))
            this.socket.emit("restart-game");
    }

    handleToggleWords(level) {
        this.socket.emit("toggle-words-level", level);
    }

    handleToggleTheme() {
        localStorage.darkTheme = !parseInt(localStorage.darkTheme) ? 1 : 0;
        document.body.classList.toggle("dark-theme");
        this.setState(Object.assign({
            userId: this.userId,
            activeWord: this.state.activeWord
        }, this.state));
    }

    handleToggleMuteSounds() {
        localStorage.muteSounds = !parseInt(localStorage.muteSounds) ? 1 : 0;
        this.setState(Object.assign({
            userId: this.userId,
            activeWord: this.state.activeWord
        }, this.state));
    }

    handleClickTogglePause() {
        this.socket.emit("toggle-pause");
    }

    handleToggleTeamLockClick() {
        this.socket.emit("toggle-lock");
    }

    toggleTraitorMode() {
        this.socket.emit("toggle-traitor-mode");
    }

    render() {
        clearTimeout(this.timerTimeout);
        if (this.state.disconnected)
            return (<div className="kicked">Disconnected</div>);
        else if (this.state.inited) {
            document.body.classList.add("captcha-solved");
            const
                data = this.state,
                isHost = data.hostId === data.userId,
                isMaster = data.bluMaster === data.userId || data.redMaster === data.userId,
                inProcess = data.words.length > 0 && data.teamWin === null && !data.paused;
            if ((data.redCommands.length !== 0 || data.bluCommands.length !== 0 || (data.masterFirstTime !== 0 && data.words.length)) && !data.teamWin) {
                let timeStart = new Date();
                this.timerTimeout = setTimeout(() => {
                    if (!this.state.paused) {
                        let prevTime = this.state.time,
                            time = prevTime - (new Date - timeStart);
                        this.setState(Object.assign({}, this.state, this.state.timed
                            ? {time: time}
                            : {[`${data.teamTurn}Time`]: this.state[`${data.teamTurn}Time`] + (new Date() - timeStart)}));
                        if (this.state.timed && time < 6000 && ((Math.floor(prevTime / 1000) - Math.floor(time / 1000)) > 0) && !parseInt(localStorage.muteSounds))
                            this.timerSound.play();
                    }
                }, 100);
            }
            return (
                <div className={
                    "game"
                    + (this.state.teamWin ? ` ${this.state.teamWin}-win` : "")
                    + (this.state.timed ? " timed" : "")
                    + (this.state.picturesMode ? " pictures" : "")}
                     onMouseUp={() => this.handleWordRelease()}>
                    <div className={
                        "game-board"
                        + (this.state.inited ? " active" : "")
                        + (isMaster ? " isMaster" : "")
                        + (data.teamsLocked ? " teamsLocked" : "")
                    }>
                        <div className="main-row">
                            {["red", "blu"].map(color => (
                                <Team
                                    color={color}
                                    data={data}
                                    handleJoinClick={(color, isMaster) => this.handleJoinClick(color, isMaster)}
                                    handleAddCommandClick={(color) => this.handleAddCommandClick(color)}
                                    handleChangeColor={() => this.handleChangeColor()}
                                    handlePassClick={(value) => this.handleWordClick(value)}
                                    handleRemovePlayer={(id, evt) => this.handleRemovePlayer(id, evt)}
                                    handleGiveHost={(id, evt) => this.handleGiveHost(id, evt)}
                                    handleEditCommand={(command, index, color, evt) => this.handleEditCommand(command, index, color, evt)}
                                />
                            ))}
                            <Words data={data}
                                   handleWordClick={index => this.handleWordClick(index)}
                                   handleWordPress={index => this.handleWordPress(index)}/>
                        </div>
                        <div className={
                            "spectators-section"
                            + ((data.spectators.length > 0 || !data.teamsLocked) ? " active" : "")
                        }>
                            <Spectators data={this.state}
                                        handleSpectatorsClick={() => this.handleSpectatorsClick()}
                                        handleChangeColor={() => this.handleChangeColor()}
                                        handleRemovePlayer={(id, evt) => this.handleRemovePlayer(id, evt)}
                                        handleGiveHost={(id, evt) => this.handleGiveHost(id, evt)}/>
                        </div>
                        <div className="host-controls">
                            <div className="host-controls-menu">
                                <div className="little-controls">
                                    {data.timed ? (<div className="game-settings">
                                        <div className="set-master-first-time"><i title="master first time (0 as ∞)"
                                                                                  className="material-icons">timer</i>
                                            {(isHost && !inProcess) ? (<input id="goal"
                                                                              type="number"
                                                                              defaultValue={this.state.masterFirstTime}
                                                                              min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "set-master-first-time")}
                                            />) : (<span className="value">{this.state.masterFirstTime || "∞"}</span>)}
                                        </div>
                                        <div className="set-master-time"><i title="master time"
                                                                            className="material-icons">alarm</i>
                                            {(isHost && !inProcess) ? (<input id="goal"
                                                                              type="number"
                                                                              defaultValue={this.state.masterTime}
                                                                              min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "set-master-time")}
                                            />) : (<span className="value">{this.state.masterTime}</span>)}
                                        </div>
                                        <div className="set-team-time"><i title="team time"
                                                                          className="material-icons">alarm_on</i>
                                            {(isHost && !inProcess) ? (<input id="round-time"
                                                                              type="number"
                                                                              defaultValue={this.state.teamTime} min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "set-team-time")}
                                            />) : (<span className="value">{this.state.teamTime}</span>)}
                                        </div>
                                        <div className="set-add-time"><i title="adding time"
                                                                         className="material-icons">alarm_add</i>
                                            {(isHost && !inProcess) ? (<input id="round-time"
                                                                              type="number"
                                                                              defaultValue={this.state.addTime} min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "set-add-time")}
                                            />) : (<span className="value">{this.state.addTime}</span>)}
                                        </div>
                                    </div>) : ""}
                                    {(isHost && !inProcess) ? (
                                        <div className="shuffle-players settings-button"
                                             onClick={() => this.handleClickShuffle()}><i
                                            title="shuffle players"
                                            className="material-icons">casino</i>
                                        </div>) : ""}
                                </div>
                                {!this.state.picturesMode ? (<div className="little-controls words-level">
                                    <span className="words-level-label">Words level:</span>
                                    <span
                                        className={((isHost && !inProcess) ? " settings-button" : "") + (this.state.wordsLevel[0] ? " level-selected" : "")}
                                        onClick={() => !inProcess && this.handleToggleWords(0)}>
                                        Original
                                    </span>
                                    <span
                                        className={((isHost && !inProcess) ? " settings-button" : "") + (this.state.wordsLevel[1] ? " level-selected" : "")}
                                        onClick={() => !inProcess && this.handleToggleWords(1)}>
                                        Easy
                                    </span>
                                    <span
                                        className={((isHost && !inProcess) ? " settings-button" : "") + (this.state.wordsLevel[2] ? " level-selected" : "")}
                                        onClick={() => !inProcess && this.handleToggleWords(2)}>
                                        Normal
                                    </span>
                                    <span
                                        className={((isHost && !inProcess) ? " settings-button" : "") + (this.state.wordsLevel[3] ? " level-selected" : "")}
                                        onClick={() => !inProcess && this.handleToggleWords(3)}>
                                        Hard
                                    </span>
                                </div>) : ""}
                                <div className="start-game-buttons">
                                    <div
                                        className={((isHost && !inProcess) ? " settings-button" : "") + (!this.state.timed ? " level-selected" : "")}
                                        onClick={() => !inProcess && this.handleClickStart("start-game")}><i
                                        className="material-icons">all_inclusive</i>Timeless
                                    </div>
                                    <div
                                        className={((isHost && !inProcess) ? " settings-button" : "") + (this.state.timed && !this.state.picturesMode ? " level-selected" : "")}
                                        onClick={() => !inProcess && this.handleClickStart("start-game-timed")}><i
                                        className="material-icons">alarm</i>Normal
                                    </div>
                                    <div
                                        className={((isHost && !inProcess) ? " settings-button" : "") + (this.state.picturesMode ? " level-selected" : "")}
                                        onClick={() => !inProcess && this.handleClickStart("start-game-pictures")}><i
                                        className="material-icons">photo</i>Pictures
                                    </div>
                                </div>
                            </div>
                            <div className="side-buttons">
                                <span
                                    className={"traitor-button" + ((isHost && !inProcess) ? " settings-button" : "") + (this.state.traitorMode ? " level-selected" : "")}
                                    onClick={() => !inProcess && this.toggleTraitorMode()}>
                                        <i className="material-icons">offline_bolt</i>Traitor mode
                                    </span>
                                {(isHost && !inProcess && data.words.length > 0) ?
                                    (<i onClick={() => this.handleClickRestart()}
                                        className="material-icons start-game settings-button">sync</i>) : ""}
                                {isHost ? (!inProcess
                                    ? (<i onClick={() => this.handleClickTogglePause()}
                                          className="material-icons start-game settings-button">play_arrow</i>)
                                    : (<i onClick={() => this.handleClickTogglePause()}
                                          className="material-icons start-game settings-button">pause</i>)) : ""}
                                {isHost ? (data.teamsLocked
                                    ? (<i onClick={() => this.handleToggleTeamLockClick()}
                                          className="material-icons start-game settings-button">lock_outline</i>)
                                    : (<i onClick={() => this.handleToggleTeamLockClick()}
                                          className="material-icons start-game settings-button">lock_open</i>)) : ""}
                                <i onClick={() => this.handleClickChangeName()}
                                   className="toggle-theme material-icons settings-button">edit</i>
                                {!parseInt(localStorage.muteSounds)
                                    ? (<i onClick={() => this.handleToggleMuteSounds()}
                                          className="toggle-theme material-icons settings-button">volume_up</i>)
                                    : (<i onClick={() => this.handleToggleMuteSounds()}
                                          className="toggle-theme material-icons settings-button">volume_off</i>)}
                                {!parseInt(localStorage.darkTheme)
                                    ? (<i onClick={() => this.handleToggleTheme()}
                                          className="toggle-theme material-icons settings-button">brightness_2</i>)
                                    : (<i onClick={() => this.handleToggleTheme()}
                                          className="toggle-theme material-icons settings-button">wb_sunny</i>)}
                            </div>
                            <i className="settings-hover-button material-icons">settings</i>
                        </div>
                    </div>
                </div>
            );
        }
        else return (<div/>);
    }
}

ReactDOM.render(<Game/>, document.getElementById('root'));
