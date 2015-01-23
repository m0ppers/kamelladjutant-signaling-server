var uuid = require("uuid");
var mopRpc = require("mop-rpc");
var MopRpc = mopRpc.MopRpc;
var name2Key = require("kamelladjutant-common").name2Key;

function Client(connection, redisClient, log) {
    this.id = uuid.v1();
    this.redisClient = redisClient;
    this.room = null;
    this.mopRpc = new MopRpc(mopRpc.createAdapter(connection));
    this.mopRpc.setLog(log);
}

Client.prototype.joinConversation = function(callbacksFactory, clients) {
    this.mopRpc.setReceiveHandler(callbacksFactory.createNullStateCallbacks(this, clients, function() {
        var updateExpire = function() {
            this.redisClient.expire(name2Key(this.room), 1800, function(err) {
                if (err) {
                    this.log.error("Couldn't set expiry in redis", err);
                }
            }.bind(this));
        }.bind(this);

        updateExpire();
        this.roomRefresher = setInterval(updateExpire, 28*60*1000); // mop: just some random time < 30 minutes ;)
        this.mopRpc.setReceiveHandler(callbacksFactory.createConnectedStateCallbacks(this, clients));
    }.bind(this)));
}

Client.prototype.dispose = function(clients) {
    if (!this.room) {
        return;
    }

    clearInterval(this.roomRefresher);
    // mop: XXX copy paste (should really introduce a room object :S)
    var roommates = function(client) {
        if (!client.room) {
            return function() {
                return false;
            };
        } else {
            return function(other) {
                return client !== other && client.room == other.room;
            }
        }
    }

    clients
    .filter(roommates(this))
    .forEach(function(roommate) {
        roommate.mopRpc.send("users", clients.filter(roommates(roommate)).map(function(roommate) {
            return {"id": roommate.id, "username": roommate.name};
        }));
    });
}

module.exports = Client;
