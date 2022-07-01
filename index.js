const express = require("express")
var app = express();
var server = app.listen(8080, () => {
    console.log('listening on 8080');
});

var io = require('socket.io')(server, {
    cors: {
        origin: '*',
    }
});

const timeGetReady = 2000; //2s
const timeReadQuestion = 2000;

let listPinCurrents = [];
let listRoomKahuts = new Map();
/**
 * key: PIN
 * value: {
 *          hostId: socket.id,
 *          acceptJoin: true,
 *          curQuestion: 0,
 *          listQuestions: listQuestions,
 *          listPlayer: {key: socket.id, value: { name: 'Player XYZ', score: 0 }}
 *          // key is socket instance of player id (socket.id)
 * }
 */

function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

io.on('connection', (socket) => {
    console.log('a user connected');
    console.log('id of client: ', socket.id);

    socket.on('HAND_SHAKE', () => {
        io.to(socket.id).emit('HAND_SHAKE', 'hehe');
    });

    /**
     * handle for host:
     * socket = {
     *  id: auto generated by framwork
     *  host: PIN <- represent for room name, random by code.
     * }
     */
    socket.on('CREATE_PIN', (listQuestions) => {
        let newPin = 0;
        while (newPin === 0 || listPinCurrents.includes(newPin)) {
            newPin = getRndInteger(100000, 999999);
        }
        listPinCurrents.push(newPin);
        listRoomKahuts.set(
            newPin,
            {
                hostId: socket.id,
                acceptJoin: true,
                curQuestion: 0,
                listQuestions: listQuestions,
                listPlayer: new Map(),
            }
        )

        socket.join(newPin);
        socket.host = newPin;

        io.to(socket.id).emit('CREATE_PIN', newPin);
    });

    socket.on('BLOCK_JOIN', () => {
        listRoomKahuts.get(socket.host).acceptJoin = !listRoomKahuts.get(socket.host).acceptJoin;
    });

    socket.on('START_GAME', () => {
        // socket.to("room1").emit(/* ... */);
        socket.to(socket.host).emit('START_GAME');
        setTimeout(function () {
            io.in(socket.host).emit('READ_QUESTION', {
                indexQuestion: listRoomKahuts.get(socket.host).curQuestion,
                timeReadQuestion: timeReadQuestion
            });
        }, timeGetReady);
    });

    // end action for host.


    /**
     * handle for player:
     * socket = {
     *  id: auto generated by framwork
     *  pin: PIN <- represent for room name, input from client.
     *  name: Name of player, input from client
     * }
     */
    socket.on('ENTER_PIN', (pinInput) => {
        pinInput = parseInt(pinInput)

        if (listPinCurrents.includes(pinInput)) {
            if (listRoomKahuts.get(pinInput).acceptJoin) {
                let listQues = JSON.parse(JSON.stringify(listRoomKahuts.get(pinInput).listQuestions));
                listQues = listQues.map((eachQuestion) => {
                    return {
                        type: eachQuestion.type,
                        time: eachQuestion.time,
                        ansAmount: eachQuestion.ans.length,
                    }
                });

                socket.join(pinInput);
                socket.pin = pinInput;

                io.to(socket.id).emit('ENTER_PIN', { isRightPin: true, listQuestions: listQues });
            } else {
                io.to(socket.id).emit('ENTER_PIN', { isRightPin: false, errMsg: "Host didn't accept to join" });
            }
        } else {
            io.to(socket.id).emit('ENTER_PIN', { isRightPin: false, errMsg: 'Your pin is incorrect' });
        }

    });

    socket.on('ENTER_NAME', (nameInput) => {
        listRoomKahuts.get(socket.pin).listPlayer.set(socket.id, { name: nameInput, score: 0 })
        socket.name = nameInput;
        io.to(listRoomKahuts.get(socket.pin).hostId).emit('PLAYER_JOIN', { id: socket.id, name: nameInput })
    });
    // end action for player.

    socket.on('disconnect', () => {

        const hostPin = socket.host;

        if (hostPin) {
            listRoomKahuts.delete(hostPin);
            var myIndex = listPinCurrents.indexOf(hostPin);
            if (myIndex !== -1) {
                listPinCurrents.splice(myIndex, 1);
            }
        }
        const playerPin = socket.pin;
        if (playerPin) {
            if (listRoomKahuts.get(playerPin)) {
                listRoomKahuts.get(playerPin).listPlayer.delete(socket.id)
                io.to(listRoomKahuts.get(socket.pin).hostId).emit('PLAYER_LEAVE', socket.id)
            }
            socket.leave(playerPin)
        }

        console.log('user disconnected');
    });
});
