var scrypt = require("scrypt");
var name2Key = require("kamelladjutant-common").name2Key;

var notMe = function(client) {
    return function(other) {
        return client !== other;
    }
}
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

var callbacksFactory = function(log, redisClient) {
    return {
        // mop: maybe create a room class which handles all the clients.filter stuff etc.
        createNullStateCallbacks: function(client, clients, changeToConnectedFn) {
            return {
                // mop: WHOAAA...way too long that function beast :O need refactor :O
                "connect": function(data, replyFn) {
                    log.debug("Got data", data);
                    var room = data.roomname;
                    var redisKey = name2Key(room); 
                    log.debug("Fetching", redisKey, "from redis");
                    redisClient.get(redisKey, function(err, rawData) {
                        if (err) {
                            log.error("Got error from redis", err);
                            return reply({"err": "INTERNAL_ERROR"});
                        }
                        
                        if (rawData === null) {
                            return replyFn({"err": "notfound"});
                        }
                        
                        var connectClient = function() {
                            if (clients.filter(roommates(client)).filter(function(otherClient) {
                                return otherClient.name == data.username;
                            }).length > 0) {
                                return replyFn({"err": "USERNAME_CONFLICT"});
                            }
                            
                            client.room = data.roomname;
                            client.name = data.username;

                            clients.filter(roommates(client)).forEach(function(otherClient) {
                                otherClient.mopRpc.send("users", clients.filter(roommates(otherClient)).map(function(roommate) {
                                    return {"id": roommate.id, "name": roommate.name};
                                }));
                            });
                            changeToConnectedFn();
                            replyFn({"err": null});
                        }       
                        var redisData = JSON.parse(rawData);
                        log.info("redis", rawData, redisData);
                        // mop: folding level is not yet deep enough to make me refacor it :O
                        if (redisData.password) {
                            scrypt.verifyHash(redisData.password, data.password, function(err, result) {
                                log.info("Verify", err, result);
                                if (!err) {
                                    connectClient();
                                } else {
                                    return replyFn({"err": "CREDENTIALS"});
                                }
                            });
                        } else {
                            connectClient();
                        }
                    });
                }
            };
        },
        createConnectedStateCallbacks: function(client, clients) {
            return {
                "users": function(data, replyFn) {
                    if (!client.room) {
                        replyFn(null);
                    } else {
                        var users = clients.filter(notMe(client)).filter(function(otherClient) {
                                return otherClient.room == client.room;
                            }).map(function(otherClient) {
                                return {"id": otherClient.id, "name": otherClient.name};
                            });
                        replyFn(users);
                    }
                },
                "initiate": function(data, answerSDPFn) {
                    var peers = clients.filter(roommates(client)).filter(function(roommate) {
                        return roommate.id == data.id;
                    });
                    if (peers.length == 1) {
                        var peerData = {"id": client.id, "offerSDP": data.offerSDP};
                        // mop: :S:S:S the power (AND CONFUSION) of mop-rpc
                        peers[0].mopRpc.send("initiate", peerData, function(answerSDP, offerCandidatesFn) {
                            answerSDPFn(answerSDP, function(offerCandidates, answerCandidatesFn) {
                                offerCandidatesFn(offerCandidates, function(answerCandidates) {
                                    answerCandidatesFn(answerCandidates);
                                }, {"replyTimeout": 20000});
                            }, {"replyTimeout": 20000});
                        }, {"replyTimeout": 20000});
                    } else {
                        log.warn("Couldn't find user with id", data.id, "in room", client.room);
                    }
                }
            } 
        }
    };
};
module.exports = callbacksFactory;
