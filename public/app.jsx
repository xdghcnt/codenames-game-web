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
            master = data[color + "Master"];
        return (
            <div className={`team ${color}`}>
                <div className="master" onClick={() => handleJoinClick(color, true)}>
                    {
                        !!master
                            ? (<Player key={master} data={data} id={master}/>)
                            : !data.teamsLocked ? (
                                <div className="join-placeholder">Become master</div>) : "Nothing here"
                    }
                </div>
                <div className="player-container" onClick={() => handleJoinClick(color)}>
                    {
                        data[color].map(
                            player => (<Player key={player} data={data} id={player}/>)
                        )
                    }
                    {data.teamsLocked || ~data[color].indexOf(data.userId) ? ("")
                        : (
                            <div className="join-placeholder">Join team</div>
                        )}
                </div>
                {data[`${color}Commands`].length || data.userId === master ? (
                    <div className="commands-container">
                        <div className="commands-title">Commands</div>
                        {
                            data[`${color}Commands`].map(
                                command => (<div className="command">{command}</div>)
                            )
                        }
                    </div>
                ) : ""}
                {data[`${color}Count`] !== null ? (
                    <div className="cards-count">
                        {data[`${color}Count`]}
                    </div>
                ) : ""}
                {data.userId === master ? (
                    <div className="add-command" onClick={() => handleAddCommandClick(color)}>+</div>
                ) : ""}
            </div>
        );
    }
}

class Player extends React.Component {
    render() {
        const data = this.props.data,
            id = this.props.id;
        return (
            <div className={
                "player"
                + (!~data.onlinePlayers.indexOf(id) ? " offline" : "")
                + (id === data.userId ? " self" : "")
            }>
                {data.playerNames[id]}
            </div>
        );
    }
}

class Spectators extends React.Component {
    render() {
        const data = this.props.data,
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
                        (player, index) => (<Player key={index} data={data} id={player}/>)
                    ) : " ..."
                }
            </div>
        );
    }
}

class Game extends React.Component {
    componentDidMount() {
        const initArgs = {};
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
        this.socket.on("state", state => this.setState(Object.assign({
            userId: this.userId,
            masterKey: this.state.masterKey
        }, state)));
        this.socket.on("masterKey", masterKey => {
            this.setState(Object.assign({}, this.state, {
                userId: this.userId,
                masterKey: masterKey
            }));
        });
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
            node.classList.add("highlight-anim");
            setTimeout(() => node.classList.remove("highlight-anim"), 0);
        });
        document.title = `Codenames - ${initArgs.roomId}`;
        this.socket.emit("init", initArgs);
    }

    constructor() {
        super();
        this.state = {
            inited: false
        };
    }

    handleWordClock(index) {
        this.socket.emit("word-click", index);
    }

    handleJoinClock(color, isMaster) {
        if (!this.state.teamsLocked)
            this.socket.emit("team-join", color, isMaster);
    }

    handleAddCommandClick(color) {
        this.socket.emit("add-command", color, prompt("Command:"));
    }

    handleSpectatorsClick() {
        if (!this.state.teamsLocked)
            this.socket.emit("spectators-join");
    }

    handleHostAction(evt) {
        const action = evt.target.className;
        if (action === "start-game" && (!this.state.teamsLocked || confirm("Restart? Are you sure?")))
            this.socket.emit("start-game");
        else if (action === "give-host")
            this.socket.emit("give-host", prompt("Nickname"));
        else if (action === "change-name") {
            const name = prompt("New name");
            this.socket.emit("change-name", name);
            localStorage.userName = name;
        }
        else if (action !== "start-game")
            this.socket.emit(action);
    }

    render() {
        clearTimeout(this.timeOut);
        if (this.state.inited && !this.state.playerNames[this.state.userId])
            return (<div>You were kicked</div>);
        else if (this.state.inited) {
            const
                data = this.state,
                isHost = data.hostId === data.userId,
                isMaster = data.bluMaster === data.userId || data.redMaster === data.userId;
            if (data.timer) {
                let timeStart = new Date();
                this.timeOut = setTimeout(() => {
                    this.setState(Object.assign({}, this.state, {timer: data.timer + (new Date() - timeStart)}));
                }, 100);
            }
            return (
                <div className="game">
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
                                    handleJoinClick={(color, isMaster) => this.handleJoinClock(color, isMaster)}
                                    handleAddCommandClick={(color) => this.handleAddCommandClick(color)}
                                />
                            ))}
                            <Words data={data} handleWordClick={index => this.handleWordClock(index)}/>
                        </div>
                        <div className={
                            "spectators-section"
                            + ((data.spectators.length > 0 || !data.teamsLocked) ? " active" : "")
                        }>
                            <Spectators data={this.state}
                                        handleSpectatorsClick={() => this.handleSpectatorsClick()}/>
                        </div>
                        <div className="host-controls">
                            <div className="host-controls-menu" onClick={evt => this.handleHostAction(evt)}>
                                {isHost ? (
                                    <div>
                                        <div className="shuffle-players">Shuffle players</div>
                                        <div className="remove-player">Remove player</div>
                                        <div className="remove-offline">Remove offline</div>
                                        <div className="give-host">Give host</div>
                                        <div className="toggle-lock">{
                                            data.teamsLocked ? "Unlock teams" : "Lock teams"
                                        }</div>
                                        <div className="start-game">Start new game</div>
                                    </div>
                                ) : ""}
                                <div>
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
