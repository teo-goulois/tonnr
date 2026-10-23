# 034. A spot made public by a request

Status: accepted on 2026-10-12. Téo asked for it that day: a spot a user adds is theirs alone, and from its panel they may ask that it be made public, "which goes to moderation on our side, to check that it is a spot known to everyone. The aim is to preserve the secret spots." He chose that an accepted spot joins the catalogue, under the Open Database License. [Decision 079](079-the-catalogue-names-no-other-list.md) keeps that licence as the catalogue's own. A break names no other list.

## Context

A spot had a `visibility`, private or public, that its owner set through the API. Nothing listed the public ones, and nothing checked them. The product vision said that a user's point "joins the catalogue only after moderation", and that was not built.

A surfer who puts a marker on a wave few people know must not publish it by one press. And a wave everyone knows, which the open sources do not list, is worth adding to everyone's map.

## Decision

- A spot is its owner's alone. No setting of the spot makes it public: `visibility` is no longer taken or answered by the API, and `GET /v1/spots/{id}` answers its owner only. The column stays one release (decision 009), read by nothing.
- The owner asks that a spot be made public, with `PUT /v1/spots/{id}/publication` and an optional word for the operator. The request waits in `spot_publication`. A spot has one request waiting at a time, and an account ten.
- The owner takes a waiting request back with `DELETE /v1/spots/{id}/publication`.
- A spot's answer says what became of its latest request, in `publication`: it waits, it was accepted, or it was refused and why.
- An operator reads the requests in the admin app, with the spot as it is now. Two signals come with each: the breaks of the catalogue within 500 meters, since the spot may be one of them, and how many other accounts keep a spot of their own within 150 meters, since a place that others keep to themselves may not be known to all. Those accounts are counted and not named.
- Accepting makes a break of the catalogue: the spot's name, its point, and what its owner says it is like. Its provider is `community`, its licence is ODbL 1.0, and it names no account. The spot stays its owner's, and now stands on that break.
- What is published is what the operator read: accepting names the spot's `updatedAt`, and a spot that changed since is refused with 409.
- A break made of a spot is a break like any other. What the owner changes in their spot afterwards does not change it, and deleting the spot leaves it. An operator takes a break out of the catalogue as they do any other.
- Refusing takes a reason, which the owner reads. They may ask again.
- Both answers are recorded with the operator's other actions (decision 020), as `spot.publish` and `spot.refuse`, with the owner's account by its identifier. A refusal keeps nothing of the spot.
- The owner agrees to the licence when they send the request. The web app says so there in one sentence, and links to its terms of use at `/terms`, which give the rest.

## Rejected

- **A public spot beside the catalogue.** Two kinds of public places would need two layers on the map, two panels, and two ways to save one. A break is already what everyone shares.
- **Keeping `visibility` as the switch, set by the operator.** A public spot would stay its owner's to rename and to move, with nobody reading the change.
- **CC0.** Téo prefers the ODbL: it is the catalogue's own licence, and a break made here stays under it.
- **Copying the spot into the request.** The operator would read a copy that the owner cannot correct. Reading the spot itself, and refusing to publish one that changed, keeps one thing to read.

## Consequences

- A key no longer reads any spot. Decision 019 let it read "a spot its owner made public": such a spot is now a break, which a key reads.
- The catalogue holds what users wrote, once an operator accepted it. Decision 015 said it held nothing of theirs.
- Nothing tells the owner that their request was answered, other than their spot. A mail or a notification is not built.
- Nothing stops two accounts from asking for the same place. The operator sees the first as a break near the second.
- An account that is deleted takes its spots and its requests with it. The breaks made of its spots stay, and name nobody.
- The terms of use are a first text, in the web app's messages. Whoever runs an instance answers for theirs.
