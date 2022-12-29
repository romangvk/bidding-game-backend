import * as functions from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { customAlphabet } from "nanoid";
import { db } from "./init";

const ROOM_CODE_LENGTH = 6;
const nanoid = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  ROOM_CODE_LENGTH
);
const isValidRoomCode = (room: string) => {
  return new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`).test(room);
};

const ROOM_MAX_SIZE = 15;

interface Room {
  players: {
    [uid: string]: { name: string; order: number };
  };
}

export const createRoom = functions.https.onCall(
  async (data: string, context) => {
    const auth = context.auth;

    if (!auth)
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Authentification failed."
      );

    if (auth?.token.roomCode)
      await db
        .ref(`lobbies/${auth?.token.roomCode}/players/${auth?.uid}`)
        .remove();

    const room = nanoid();
    await db.ref(`lobbies/${room}`).set({
      players: { [auth?.uid as string]: { name: data, order: 1 } },
    });

    await getAuth().setCustomUserClaims(auth?.uid as string, {
      roomCode: room,
    });

    return room;
  }
);

export const joinRoom = functions.https.onCall(
  async (data: { name: string; room: string }, context) => {
    const auth = context.auth;

    if (!auth?.uid)
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Authentification failed."
      );

    if (!isValidRoomCode(data.room))
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Invalid room code."
      );

    const transactionResult = await db
      .ref(`lobbies/${data.room}/players`)
      .transaction((players: Room["players"]) => {
        if (!players) {
          return {
            players: { [auth?.uid as string]: { name: data.name, order: 1 } },
          };
        } else if (Object.keys(players).length < ROOM_MAX_SIZE) {
          if (Object.values(players).some((p) => p.name === data.name)) return;

          const order = Object.keys(players).length + 1;

          const places = [];
          for (const id of Object.keys(players)) {
            places[players[id].order - 1] = id;
          }
          for (const [i, id] of places.filter((e) => e).entries()) {
            players[id].order = i + 1;
          }

          players[auth?.uid as string] = { name: data.name, order };

          return players;
        }
        return;
      });

    if (transactionResult.committed) {
      console.log(transactionResult.snapshot.val());
      if (auth?.token.roomCode) {
        await db
          .ref(`lobbies/${auth?.token.roomCode}/players/${auth?.uid}`)
          .remove();
      }
      await getAuth().setCustomUserClaims(auth?.uid as string, {
        roomCode: data.room,
      });
      return data.room;
    } else {
      throw new functions.https.HttpsError("unavailable", "Not added to room.");
    }
  }
);
