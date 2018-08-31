const
    wsServer = new (require("ws-server-engine"))({
        maxRoomsPerIP: 2
    }),
    game = require("./module");
game(wsServer, "/bg/codenames");