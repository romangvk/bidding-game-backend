import * as functions from "firebase-functions";
import { ServerValue } from "firebase-admin/database";
import { db } from "./init";

export const increment = functions.https.onCall(
  async (data: undefined, context) => {
    const uid = context.auth?.uid;
    const roomCode = context.auth?.token.roomCode;
    if (!uid || !roomCode) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Authentification failed."
      );
    }
    if (
      (await db.ref(`lobbies/${roomCode}/players/${uid}/name`).get()).exists()
    ) {
      await db.ref(`games/${roomCode}/data`).set(ServerValue.increment(1));
      return;
    }
    throw new functions.https.HttpsError(
      "failed-precondition",
      "You do not have access to this room."
    );
  }
);
