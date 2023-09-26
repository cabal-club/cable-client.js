<!--
SPDX-FileCopyrightText: 2023 the cabal-club authors

SPDX-License-Identifier: AGPL-3.0-or-later
-->

# cable-client

**Status**: alpha (api surface still in flux)

`cable-client` is a client library for implementing chat clients running the [cable](https://github.com/cabal-club/cable/) protocol

New chat clients may be implemented using solely this library, without having to interface
directly with the lower level [`cable-core`](https://github.com/cabal-club/cable-core.js/)
library.

**Responsibilities**:

* Provides networking primitives (currently: tcp, hyperswarm (experimental), lan transport (experimental))
* Provides a clean api for implementing a chat client, including causal message
  ordering using [cable](https://github.com/cabal-club/cable/)'s links concept
* Internally manages all messages needed for synchronizing over cable 

**Non-responsibilities**:

* Does not handle serializing & deserializing cable's binary buffers ([cable.js](https://github.com/cabal-club/cable.js) does that)
* Does not provide lower-level methods for cable message/post creation nor interacting with database indexes ([cable-core](https://github.com/cabal-club/cable-core.js/) does that)

Some of its features:

- Consolidates logic common to all chat clients, like retrieving and ordering a range of posts for a particular channel
- Leaving and joining of channels, setting topics
- Deletion of one's own posts
- Virtual messages, such as status messages or rendering usage instructions for different commands <!--and virtual channels (currently only the `!status` channel)-->

## Usage

See [`cabal@cable`](https://github.com/cabal-club/cabal-cli/) for an example client implementation.

```js
// shim.js is an adaptor between the new cable-client (which has slight changes) and the old cabal-client api
// to facilitate an interim transition period for cabal clients as they update to the cable wire protocol
var Client = require('cable-client/shim.js').Client

const client = new Client({
  config: {
  config: {
    keypair,        // the keypair to use
    dbdir: "/tmp/cabals",
    temp: true,
    serve: true,    // set to true if serving / listening for connections over tcp
    disableDHT: true,
    disableTCP: false,
    disableLAN: true,
    ip: "",         // only needed when connecting to a serving tcp instance; set ip or domain name
    dhtPort: null,  // default port is 13331
    lanPort: null,  // default lan port is 13332
    tcpPort: null   // default tcp port is 13333
  },
  }
})

client.createCabal()
  .then((cabal) => {
    // resolves when the cabal is ready, returns a CableClient instance
  })
```

## Concepts

`cable-client` has **two abstractions**:
[`CableClient`](https://github.com/cabal-club/cable-client.js/blob/master/cable-client.js) and
[`ChannelDetails`](https://github.com/cabal-club/cable-client.js/blob/master/src/channel-details.js).

[`CableClient`](https://github.com/cabal-club/cable-client.js/blob/master/src/cabal-details.js) is the
instance that clients mostly operate on, as it encapsulates all information for a particular cabal. (joined channels,
users in that channel, the topic). It also emits events.

When a change has happened, a `CableClient` instance will emit an `update` event. When a client receives this
event, they should update their state & rerender. 

[`ChannelDetails`](https://github.com/cabal-club/cable-client.js/blob/master/src/channel-details.js)
encapsulates everything channels (mentions in that channel, status messages for the channel
(like having called a command eg `/names`, when it was last read, if it's currently being
viewed, if it's joined and so on). It also has a barebones implementation for virtual channels,
which currently is only the `!status` channel.

## Transitioning from the old `cabal-client` library
Clients that have yet to transition from the old cabal-client library may start their refactor
to running cable-client by opting to use the adaptor `shim.js`: 

```js
require('cable-client/shim.js').Client
const client = new Client({..})
```

The shim acts as a translation layer between the two APIs as well as a guide to what has been
changed, [check out the code](https://github.com/cabal-club/cable-client.js/blob/master/shim.js).

## Install

With [npm](https://npmjs.org/) installed, run

```
$ npm install cable-client
```

<!--## Developing

### Changelog

See the instructions for generating the changelog in the [cabal-core readme](https://github.com/cabal-club/cabal-core/#developing).
-->

## License

AGPL-3.0-or-later
