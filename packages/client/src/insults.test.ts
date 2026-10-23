import { hasInsult } from "@repo/config/insults";
import { describe, expect, it } from "vitest";

// The list of `packages/config/src/insults.ts`, which the API, the web app and the app for phones
// read alike: what others read of an account holds no insult (decisions 041 and 067).

describe("an insult in what others read", () => {
  it("is found whole, whatever its case and its marks, and in the plural", () => {
    for (const text of [
      "Bande de connards, laissez-nous le pic",
      "Quel ENCULÉ celui qui m'a coupé",
      "you absolute wanker",
      "Ese cabrón me ha soltado la tabla",
      "Que cabrão, roubou-me a onda",
      "putas olas",
      "bitches everywhere",
    ]) {
      expect(hasInsult(text), text).toBe(true);
    }
  });

  it("is never found inside another word, nor where a word means something else", () => {
    for (const text of [
      "Un connaisseur du coin dit que ça rentre à marée montante",
      "Du retard sur la marée, ça marche plus tard",
      "Um puto de doze anos a apanhar as melhores",
      "Ele pede sempre a primeira onda",
      "Sesión con viento flojo y series de metro",
      "Vent bâtard, houle bâtarde, mais ça passe",
      "Spices and coffee at the car park",
      "Scunthorpe crew out in force",
      "",
    ]) {
      expect(hasInsult(text), text).toBe(false);
    }
  });
});
