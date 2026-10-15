import { describe, expect, it } from "vitest";

import { fold, slugify } from "@repo/config/names";

describe("fold", () => {
  it("reads a name in small letters without its marks", () => {
    expect(fold("Guéthary")).toBe("guethary");
    expect(fold("L'Étang-Salé")).toBe("l etang sale");
  });
});

describe("slugify", () => {
  it("writes a name as an address", () => {
    expect(slugify("Praia da Cordoama")).toBe("praia-da-cordoama");
    expect(slugify("Jeffreys Bay (J-Bay)")).toBe("jeffreys-bay-j-bay");
    expect(slugify("Cullera/Jucar")).toBe("cullera-jucar");
    expect(slugify("Mulki, Karnataka")).toBe("mulki-karnataka");
    expect(slugify("P.H. Hoeft State Park")).toBe("p-h-hoeft-state-park");
  });

  it("takes the marks off the letters of every coast", () => {
    expect(slugify("Grønnestrand")).toBe("gronnestrand");
    expect(slugify("Şah Inn")).toBe("sah-inn");
    expect(slugify("Åland")).toBe("aland");
    expect(slugify("São Tomé and Príncipe")).toBe("sao-tome-and-principe");
    expect(slugify("Łeba")).toBe("leba");
    expect(slugify("İliksu Plaji")).toBe("iliksu-plaji");
    expect(slugify("Panamá La Vieja (Panama City)")).toBe("panama-la-vieja-panama-city");
  });

  it("is empty for a name with no letter or digit", () => {
    expect(slugify("???")).toBe("");
  });
});
