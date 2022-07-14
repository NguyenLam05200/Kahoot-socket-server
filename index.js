const express = require("express")
var app = express();

const port = process.env.PORT || 8080;

var server = app.listen(port, () => {
    console.log(`listening on ${port}`);
});

var io = require('socket.io')(server, {
    cors: {
        origin: '*',
    }
});

const timeGetReady = 2000; //2s
const timeReadQuestion = 2000;
const pointStandard = 1000;

let listPinCurrents = [];
let listRoomKahuts = new Map();
/**
 * key: PIN
 * value: {
 *          hostId: socket.id,
 *          timeStart: time start game // data for report
 *          acceptJoin: true,
 *          curQuestion: 0,
 *          listQuestions: listQuestions,
 *          listPlayers: {key: socket.id, value: { name: 'Player XYZ', score: 0, ansCorrect: [] }}
 *          // key is socket instance of player id (socket.id)
 * }
 */

function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

io.on('connection', (socket) => {
    // console.log(`${socket.id} connected`);

    socket.on('HAND_SHAKE', () => {
        io.to(socket.id).emit('HAND_SHAKE');
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

        // modify schema quiz:

        listQuestions.map(eachQuestion => {
            let ans = [];
            let correctAns = [];
            // if (eachQuestion.type === 0) {
            //     eachQuestion.type = 'Quiz';
            // } else if (eachQuestion.type === 1) {
            //     eachQuestion.type = 'True or False'
            // } else if (eachQuestion.type === 2) {
            //     eachQuestion.type = 'Multi selections'
            // }

            eachQuestion.ans.map((eachAns, index) => {
                ans.push(eachAns.text);
                if (eachAns.isRight) {
                    correctAns.push(index);
                }
            })
            eachQuestion.ans = ans;
            eachQuestion.correctAns = correctAns;
        })

        listRoomKahuts.set(
            newPin,
            {
                hostId: socket.id,
                timeStart: null,
                acceptJoin: true,
                curQuestion: 0,
                listQuestions: listQuestions,
                listPlayers: new Map(),
                listAnsReceived: [],
                listEmit: [],
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
        listRoomKahuts.get(socket.host).acceptJoin = false;
        listRoomKahuts.get(socket.host).timeStart = Date.now();

        socket.to(socket.host).emit('START_GAME');
        setTimeout(function () {
            io.in(socket.host).emit('READ_QUESTION', {
                indexQuestion: listRoomKahuts.get(socket.host).curQuestion,
                timeReadQuestion: timeReadQuestion
            });
        }, timeGetReady);
    });

    socket.on('NEXT_QUESTION', () => {
        listRoomKahuts.get(socket.host).curQuestion += 1


        io.in(socket.host).emit('READ_QUESTION', {
            indexQuestion: listRoomKahuts.get(socket.host).curQuestion,
            timeReadQuestion: timeReadQuestion
        });
        //reset 
        listRoomKahuts.get(socket.host).listAnsReceived = []
        listRoomKahuts.get(socket.host).listEmit = []
    });

    socket.on('SKIP', () => {
        const roomPersist = listRoomKahuts.get(socket.host);
        roomPersist.listQuestions[roomPersist.curQuestion].correctCount = -1;
        roomPersist.listEmit.map(eachEmi => {
            io.to(eachEmi.to).emit(eachEmi.type, eachEmi.scorePlus)
        })
        socket.to(socket.host).emit('SKIP');
    });

    socket.on('SHOW_RESULT', () => {
        socket.to(socket.host).emit('TIME_UP')
        listRoomKahuts.get(socket.host).listEmit.map(eachEmi => {
            io.to(eachEmi.to).emit(eachEmi.type, eachEmi.scorePlus)
        })
        const curQuestionIndex = listRoomKahuts.get(socket.host).curQuestion;

        listRoomKahuts.get(socket.host).listEmit.map(eachEmi => {
            if (eachEmi.type === 'CORRECT') {
                listRoomKahuts.get(socket.host).listPlayers.get(eachEmi.to).score += eachEmi.scorePlus;
                listRoomKahuts.get(socket.host).listPlayers.get(eachEmi.to).correctAns.push(curQuestionIndex);
            }
        })
    });

    socket.on('SCORE_BOARD', () => {
        let mapPlayer = listRoomKahuts.get(socket.host).listPlayers;
        /**
         * Example of sort map in javascript:
         * let map = new Map([
         *                  [4, {name: 'Lam', score: 100}], 
         *                  [3, {name: 'Thanh', score: 300}], 
         *                  [5, {name: 'Alex', score: 200}], 
         *                  [1, {name: 'Nga', score: 1000}]
         *                  ])
         * map = new Map([...map.entries()].sort((a, b) => b[1].score - a[1].score));
         * Output:
         *  0: {1 => Object}
            key: 1
            value: {name: 'Nga', score: 1000}
            1: {3 => Object}
            key: 3
            value: {name: 'Thanh', score: 300}
            2: {5 => Object}
            key: 5
            value: {name: 'Alex', score: 200}
            3: {4 => Object}
            key: 4
            value: {name: 'Lam', score: 100}
         */
        // sort giam dan theo diem so
        mapPlayer = new Map([...mapPlayer.entries()].sort((a, b) => b[1].score - a[1].score));

        let res = []
        let itr = mapPlayer.values();
        for (i = 0; i < 5; i++) {
            const eachScoreBoard = itr.next().value;
            if (eachScoreBoard && eachScoreBoard.score !== 0) {
                res.push(eachScoreBoard)
            }
        }
        const roomPersist = listRoomKahuts.get(socket.host);

        const curQuestionIndex = roomPersist.curQuestion + 1;
        if (curQuestionIndex >= roomPersist.listQuestions.length) {
            //trigger for all players drum on ...
            socket.to(socket.host).emit('PREPARE_SUMARY');

            // prepare sumary for host
            let reportData = [];
            let tuTotal = 0;
            let mauTotal = 0;
            let percentRightTotal = 0;

            const sumPlayers = roomPersist.listPlayers.size;
            roomPersist.listQuestions.map((eachQuestion, index) => {
                if (eachQuestion.correctCount === -1) { //skip question
                    reportData.push([index, 101])
                } else if (eachQuestion.correctCount > -1) {
                    tuTotal += eachQuestion.correctCount;
                    mauTotal += sumPlayers;
                    reportData.push([index, Math.floor(eachQuestion.correctCount * 100 / sumPlayers)])
                } else { // no one correct
                    mauTotal += sumPlayers;
                    reportData.push([index, 0])
                }
            })

            if (mauTotal !== 0) { //all questions is not skiped
                percentRightTotal = Math.floor(tuTotal * 100 / mauTotal)
            }

            io.to(socket.id).emit(
                'PREPARE_SUMARY',
                {
                    rating: res,
                    reportData: reportData.sort(sortFunction),
                    percentRightTotal: percentRightTotal
                })

            // prepare sumary for each player
            let itr2 = mapPlayer.keys();
            for (i = 0; i < mapPlayer.size; i++) {
                const playerSocketId = itr2.next().value
                io.to(playerSocketId).emit('SUMARY_DATA', i + 1);
            }
        } else {
            io.to(socket.id).emit('SCORE_BOARD', res)
        }
    });

    socket.on('SUMARY', () => {
        socket.to(socket.host).emit('SUMARY');
    });

    socket.on('PLAY_AGAIN', () => {
        // socket.to("room1").emit(/* ... */);
        const roomPersist = listRoomKahuts.get(socket.host)
        roomPersist.listQuestions.filter(eachQuestion => delete eachQuestion.correctCount)
        roomPersist.timeStart = null
        roomPersist.acceptJoin = true
        roomPersist.curQuestion = 0
        roomPersist.listAnsReceived = []
        roomPersist.listEmit = []

        socket.to(socket.host).emit('PLAY_AGAIN')
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
        pinInput = parseInt(pinInput.split(' ').join(''))

        if (listPinCurrents.includes(pinInput)) {
            if (listRoomKahuts.get(pinInput).acceptJoin) {
                let listQues = JSON.parse(JSON.stringify(listRoomKahuts.get(pinInput).listQuestions));
                listQues = listQues.map((eachQuestion) => {
                    return {
                        type: eachQuestion.type,
                        timeLimit: eachQuestion.time,
                        totalAns: eachQuestion.ans.length,
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
        listRoomKahuts.get(socket.pin).listPlayers.set(socket.id, { name: nameInput, score: 0, correctAns: [] })
        socket.name = nameInput;
        io.to(listRoomKahuts.get(socket.pin).hostId).emit('PLAYER_JOIN', { id: socket.id, name: nameInput })
    });

    socket.on('SEND_ANSWER', (ans) => {
        let roomKahut = listRoomKahuts.get(socket.pin)

        io.to(roomKahut.hostId).emit('SEND_ANSWER', ans)

        const questionCurrent = roomKahut.listQuestions[roomKahut.curQuestion];
        // xét đúng sai
        if (compareResult(ans, questionCurrent.correctAns)) {
            // True => tính điểm
            const timestamp = Date.now();

            const len = roomKahut.listAnsReceived.length

            let pointAnchor = 0;
            if (questionCurrent.points === 1) {
                pointAnchor = pointStandard;
            } else if (questionCurrent.points === 2) {
                pointAnchor = pointStandard * 2;
            }

            if (len === 0) {
                //first answer:
                roomKahut.listEmit.push({ to: socket.id, type: 'CORRECT', scorePlus: pointAnchor });
                roomKahut.listQuestions[roomKahut.curQuestion].correctCount = 1;
            } else {
                const point = Math.floor(pointAnchor - (pointAnchor / (questionCurrent.time * 1000) * (timestamp - roomKahut.listAnsReceived[0])))
                roomKahut.listEmit.push({ to: socket.id, type: 'CORRECT', scorePlus: point });
                roomKahut.listQuestions[roomKahut.curQuestion].correctCount += 1;
            }
            roomKahut.listAnsReceived.push(timestamp);
        } else {
            roomKahut.listEmit.push({ to: socket.id, type: 'INCORRECT', scorePlus: '' });
        }
    });
    // end action for player.

    socket.on('disconnect', () => {

        const hostPin = socket.host;

        if (hostPin) {
            socket.to(socket.host).emit('HOST_LEAVE');
            listRoomKahuts.delete(hostPin);
            var myIndex = listPinCurrents.indexOf(hostPin);
            if (myIndex !== -1) {
                listPinCurrents.splice(myIndex, 1);
            }
        }
        const playerPin = socket.pin;
        if (playerPin) {
            if (listRoomKahuts.get(playerPin)) {
                listRoomKahuts.get(playerPin).listPlayers.delete(socket.id)
                io.to(listRoomKahuts.get(socket.pin).hostId).emit('PLAYER_LEAVE', socket.id)
            }
            socket.leave(playerPin)
        }
        // console.log(`${socket.id} disconnected`);
    });
});

function compareResult(arr1, arr2) {
    arr1 = arr1.sort()
    arr2 = arr2.sort()
    return arr1.join() == arr2.join();
}
function sortFunction(a, b) {
    if (a[1] === b[1]) {
        return 0;
    }
    else {
        return (a[1] < b[1]) ? -1 : 1;
    }
}