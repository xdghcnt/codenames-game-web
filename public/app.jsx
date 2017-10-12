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
            handleWordClick = this.props.handleWordClick;
        return (
            <div className="words">
                {data.words.map((word, index) => (
                    <div data={data} onClick={() => handleWordClick(index)} className={
                        "word"
                        + (data.key[index] ? ` word-guessed word-${data.key[index]}` : "")
                        + ((data.masterKey && !data.key[index]) ? ` word-${data.masterKey[index]}` : "")
                    }>
                        <div className="word-box" data-wordIndex={index}>
                            <span>{word}</span>
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
            time = new Date(data.timed ? ((data.teamTurn === color ? data.time : (data.masterTime * 1000))) : data[`${color}Time`]) || 0;
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
                                       handleChangeColor={this.props.handleChangeColor}/>)
                            : !data.teamsLocked ? (
                                <div className="join-placeholder">Become master</div>) : "Nothing here"
                    }
                </div>
                <div className="player-container" onClick={() => handleJoinClick(color)}>
                    {
                        data[color].map(
                            player => (<Player key={player} data={data} id={player}
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
                                + ((data.timed && (time !== 0 && time < 6000)) ? " critical" : "")
                            }>
                                <span className="timer-time">
                                    {time.toUTCString().match(/(\d\d:\d\d )/)[0].trim()}
                                </span>
                                <i className="material-icons timer-button">alarm</i>
                            </div>
                        </div>
                        {
                            data[`${color}Commands`].map(
                                command => (<div className="command">{command}</div>)
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
            }>
                <div className="player-color" style={{background: data.playerColors[id]}}
                     onClick={() => (id === data.userId) && this.props.handleChangeColor()}/>
                {data.playerNames[id]}
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
                                                    handleChangeColor={this.props.handleChangeColor}/>)
                    ) : " ..."
                }
            </div>
        );
    }
}

class Game extends React.Component {
    componentDidMount() {
        const initArgs = {};
        if (parseInt(localStorage.darkTheme))
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
        this.socket = io();
        this.socket.on("state", state => {
            this.setState(Object.assign({
                userId: this.userId,
                masterKey: this.state.masterKey
            }, state));
            if (!~state.onlinePlayers.indexOf(this.userId))
                this.socket.emit("ping");
        });
        this.socket.on("masterKey", masterKey => {
            this.setState(Object.assign({}, this.state, {
                userId: this.userId,
                masterKey: masterKey
            }));
        });
        this.socket.on("masterKeyUpdated", () => this.socket.emit("request-master-key"));
        this.socket.on("message", text => {
            alert(text);
        });
        this.socket.on("disconnect", () => {
            this.setState({
                inited: false
            });
            window.location.reload();
        });
        this.socket.on("highlight-word", (wordIndex) => {
            const node = document.querySelector(`[data-wordIndex='${wordIndex}']`);
            if (node) {
                node.classList.add("highlight-anim");
                setTimeout(() => node.classList.remove("highlight-anim"), 0);
            }
        });
        document.title = `Codenames - ${initArgs.roomId}`;
        this.socket.emit("init", initArgs);
        this.timerSound = new Audio("timer-beep.mp3");
        this.timerSound.volume = 0.5;
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

    handleHostAction(evt) {
        const action = evt.target.className;
        if ((action === "start-game" || action === "start-game-timed") && (!this.state.teamsLocked || confirm("Restart? Are you sure?")))
            this.socket.emit(action);
        else if (action === "give-host")
            this.socket.emit("give-host", prompt("Nickname"));
        else if (action === "remove-player")
            this.socket.emit("remove-player", prompt("Nickname"));
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

    render() {
        clearTimeout(this.timerTimeout);
        if (this.state.inited && !this.state.playerNames[this.state.userId])
            return (<div>You were kicked</div>);
        else if (this.state.inited) {
            const
                data = this.state,
                isHost = data.hostId === data.userId,
                isMaster = data.bluMaster === data.userId || data.redMaster === data.userId;
            if ((data.redCommands.length !== 0 || data.bluCommands.length !== 0) && !data.teamWin) {
                let timeStart = new Date();
                this.timerTimeout = setTimeout(() => {
                    if (!this.state.paused) {
                        let prevTime = this.state.time,
                            time = prevTime - (new Date - timeStart);
                        this.setState(Object.assign({}, this.state, this.state.timed
                            ? {time: time}
                            : {[`${data.teamTurn}Time`]: this.state[`${data.teamTurn}Time`] + (new Date() - timeStart)}));
                        if (this.state.timed && time < 6000 && ((Math.floor(prevTime / 1000) - Math.floor(time / 1000)) > 0))
                            this.timerSound.play();
                    }
                }, 100);
            }
            return (
                <div className={
                    "game"
                    + (this.state.teamWin ? ` ${this.state.teamWin}-win` : "")
                    + (this.state.timed ? " timed" : "")
                }>
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
                                />
                            ))}
                            <Words data={data} handleWordClick={index => this.handleWordClick(index)}/>
                        </div>
                        <div className={
                            "spectators-section"
                            + ((data.spectators.length > 0 || !data.teamsLocked) ? " active" : "")
                        }>
                            <Spectators data={this.state}
                                        handleSpectatorsClick={() => this.handleSpectatorsClick()}
                                        handleChangeColor={() => this.handleChangeColor()}/>
                        </div>
                        <div className="host-controls">
                            <div className="host-controls-menu" onClick={evt => this.handleHostAction(evt)}>
                                {isHost ? (
                                    <div>
                                        <div className="shuffle-players">Shuffle players</div>
                                        <div className="remove-player">Remove player</div>
                                        <div className="remove-offline">Remove offline</div>
                                        <div className="toggle-pause">{
                                            !data.paused ? "Pause timer" : "Unpause timer"
                                        }</div>
                                        <div className="skip-team">Skip team</div>
                                        <div className="give-host">Give host</div>
                                        <div className="set-master-time">Set master time</div>
                                        <div className="set-team-time">Set team time</div>
                                        <div className="set-add-time">Set adding time</div>
                                        <div className="toggle-lock">{
                                            data.teamsLocked ? "Unlock teams" : "Lock teams"
                                        }</div>
                                        <div className="start-game-timed">Start timed game</div>
                                        <div className="start-game">Start new game</div>
                                    </div>
                                ) : ""}
                                <div>
                                    <div className="toggle-theme">Toggle theme</div>
                                    <div className="change-name">Change name</div>
                                </div>
                            </div>
                            <i className="material-icons settings-button">settings</i>
                        </div>
                    </div>
                </div>
            );
        }
        else return (<div/>);
    }
}

ReactDOM.render(<Game/>, document.getElementById('root'));
