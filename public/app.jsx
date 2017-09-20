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
                        + (data.key[index] ? ` word-${data.key[index]}` : " word-closed")
                        + ((data.masterKey && !data.key[index]) ? ` word-${data.masterKey[index]}` : "")
                    }>
                        {word}
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
            master = data[color + "Master"];
        return (
            <div className={`team ${color}`}>
                <div className="master" onClick={() => handleJoinClick(color, true)}>
                    {
                        !!master
                            ? (<Player key={master} data={data} id={master}/>)
                            : (<div className="join-placeholder">
                                Become master
                            </div>)
                    }
                </div>
                <div className="players-container" onClick={() => handleJoinClick(color)}>
                    {
                        data[color].map(
                            player => (<Player key={player} data={data} id={player}/>)
                        )
                    }
                    {data.teamsLocked ? ("")
                        : (
                            <div className="join-placeholder">Join team</div>
                        )}
                </div>
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
                {
                    data.spectators && data.spectators.map(
                        (player, index) => (<Player key={index} data={data} id={player}/>)
                    )
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

    handleSpectatorsClick() {
        if (!this.state.teamsLocked)
            this.socket.emit("spectators-join");
    }

    handleHostAction(evt) {
        const action = evt.target.className;
        if (action === "give-host")
            this.socket.emit("give-host", prompt("Nickname"));
        else if (action === "change-name") {
            const name = prompt("New name");
            this.socket.emit("change-name", name);
            localStorage.userName = name;
        }
        else
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
                    }>
                        <div className="main-row">
                            <Team
                                color="red"
                                data={data}
                                handleJoinClick={(color, isMaster) => this.handleJoinClock(color, isMaster)}
                            />
                            <Words data={data} handleWordClick={index => this.handleWordClock(index)}/>
                            <Team
                                color="blu"
                                data={data}
                                handleJoinClick={(color, isMaster) => this.handleJoinClock(color, isMaster)}
                            />
                        </div>
                        <div className={
                            "spectators-section"
                            + ((data.spectators.length > 0 || !data.teamsLocked) ? " active" : "")
                        }>
                            Spectators:
                            <br/>
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
                                    </div>
                                ) : ""}
                                <div>
                                    <div className="start-game">Start game</div>
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
