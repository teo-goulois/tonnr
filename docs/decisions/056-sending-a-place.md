# 056. Sending a surf break or a station

Status: decided on 2026-10-15, at Téo's request to send a spot to a friend, who opens it straight away. It amends [decision 039](039-visitors.md) by one thing a closed instance still answers.

## Decision

- A surf break of the catalogue or a station is sent by a short address of the web app, `/b/<id>` or `/s/<id>`, which leads to the map on its panel. A button of the panel hands it to the phone's own sheet, or copies it. A spot of an account's own is not sent this way: it is its owner's, and a shared list sends it (decision 035).
- The server renders that address for the sites a link is sent through, which read no script: its title names what was sent, and its picture, `og-place-<locale>.jpg`, says what the link opens. A browser goes on to the map at once.
- The name comes from `breaks.named` or `stations.named`, built on `linkProcedure`: they take neither a key nor a session, answer even while the instance is closed to visitors, and say the name and nothing else. A break's name and a station's are what the map shows anyone already, and the catalogue is published under its own licences: no account is named. They are counted as any call is.

## Consequences

- While an instance is closed to visitors, whoever opens the link without an account meets the sign-in, as with any address of the map. The name in the message still tells them what was sent.
- The picture is the same for every break and every station. One drawn for each, with its figures, would need pictures made on request, which the web app does not do.
