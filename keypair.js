// SPDX-FileCopyrightText: 2023 the cabal-club authors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

const crypto = require("cable.js/cryptography.js")
const { serializeKeypair, deserializeKeypair } = require("cable.js/util.js")
const b4a = require("b4a")

// `storage`: a type of random-access-memory (one of RAW / RAM / RAF)
// `keypath`: the full path where the keypair should be stored
// `temp`:    true if we want to generate a temporary keypair
// `done`:    a callback, accepting the deserialized keypair
function readOrGenerateKeypair(storage, keypath, temp, done) {
  if (temp) { return done(crypto.generateKeypair) }
  const file = new storage(keypath)
  let key
  readKeypair(file, (err, buf) => {
    // key wasn't found
    if (err && err.code === "ENOENT") {
      key = crypto.generateKeypair()
      writeKeypair(file, b4a.from(serializeKeypair(key)), () => {
        return done(key)
      })
    } else if (err) {
      throw err 
    } else {
      key = deserializeKeypair(b4a.toString(buf))
      return done(key)
    }
  })
}

function readKeypair(file, cb) {
  file.stat((err, stat) => {
    if (err) { return cb(err, null) }
    file.read(0, stat.size, (err, data) => {
      if (err) { return cb(err, null) }
      return cb(null, data)
    })
  })
}

function writeKeypair(file, data, cb) {
  file.write(0, data, (err) => {
    if (err) { throw err }
    cb()
  })
}

module.exports = readOrGenerateKeypair
