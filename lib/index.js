// gridfs-stream

/**
 * Module dependencies.
 */

var GridWriteStream = require('./writestream')
var GridReadStream = require('./readstream')

/**
 * Grid constructor
 *
 * @param {mongo.Db} db - an open mongo.Db instance
 * @param {mongo} [mongo] - the native driver you are using
 */

function Grid (db, mongo) {
  if (!(this instanceof Grid)) {
    return new Grid(db, mongo);
  }

  mongo || (mongo = Grid.mongo ? Grid.mongo : undefined);

  if (!mongo) throw new Error('missing mongo argument\nnew Grid(db, mongo)');
  if (!db) throw new Error('missing db argument\nnew Grid(db, mongo)');

  // the db must already be open b/c there is no `open` event emitted
  // in old versions of the driver
  this.db = db;
  this.mongo = mongo;
  this.curCol = this.mongo.GridStore ? this.mongo.GridStore.DEFAULT_ROOT_COLLECTION : 'fs';
}

/**
 * Creates a writable stream.
 *
 * @param {Object} [options]
 * @return Stream
 */

Grid.prototype.createWriteStream = function (options) {
  return new GridWriteStream(this, options);
}

/**
 * Creates a readable stream. Pass at least a filename or _id option
 *
 * @param {Object} options
 * @return Stream
 */

Grid.prototype.createReadStream = function (options) {
  return new GridReadStream(this, options);
}

/**
 * The collection used to store file data in mongodb.
 * @return {Collection}
 */

Object.defineProperty(Grid.prototype, 'files', {
  get: function () {
    if (this._col) return this._col;
    return this.collection();
  }
});

/**
 * Changes the default collection to `name` or to the default mongodb gridfs collection if not specified.
 *
 * @param {String|undefined} name root gridfs collection name
 * @return {Collection}
 */

Grid.prototype.collection = function (name) {
  this.curCol = name || this.curCol || this.mongo.GridStore.DEFAULT_ROOT_COLLECTION;
  return this._col = this.db.collection(this.curCol + ".files");
}

/**
 * Removes a file by passing any options, at least an _id or filename
 *
 * @param {Object} options
 * @param {Function} callback
 */

Grid.prototype.remove = function (options, callback) {
  var _id;
  if (options._id) {
    _id = this.tryParseObjectId(options._id) || options._id;
  }
  if (!_id) {
    _id = options.filename;
  }
  return this.mongo.GridStore.unlink(this.db, _id, options, callback);
}

/**
 * Checks if a file exists by passing a filename
 *
 * @param {Object} options
 * @param {Function} callback
 */

Grid.prototype.exist = function (options, callback) {
    var _id;
    if (options._id) {
        _id = this.tryParseObjectId(options._id) || options._id;
    }
    if (!_id) {
        _id = options.filename;
    }
    return this.mongo.GridStore.exist(this.db, _id, options.root, callback);
}

/**
 * Find file by passing any options, at least an _id or filename
 *
 * @param {Object} options
 * @param {Function} callback
 */

Grid.prototype.findOne = function (options, callback) {
  if ('function' != typeof callback) {
    throw new Error('findOne requires a callback function');
  }
  var find = {};
  for (var n in options) {
    if (n != 'root') {
      find[n] = options[n];
    }
  }
  if (find._id) {
    find._id = this.tryParseObjectId(find._id) || find._id;
  }
  var collection = options.root  && options.root != this.curCol ? this.mongo.Collection(this.db, options.root+'.files', null, null) : this.files;
  if (!collection) {
    return callback(new Error('No collection specified'));
  }
  collection.find(find, function(err, cursor) {
    if (err) { return callback(err); }
    if (!cursor) { return callback(new Error('Collection not found')); }
    cursor.nextObject(callback);
  });
}

/**
 * Find files by passing any options
 *
 * @param {Object} options
 * @param {Function} callback
 */

Grid.prototype.find = function (options, callback) {
  if ('function' != typeof callback) {
    throw new Error('find requires a callback function');
  }
  var find = {};
  for (var n in options) {
    if (n != 'root') {
      find[n] = options[n];
    }
  }
  if (find._id) {
    find._id = this.tryParseObjectId(find._id) || find._id;
  }
  var collection = options.root  && options.root != this.curCol ? this.mongo.Collection(this.db, options.root+'.files', null, null) : this.files;
  if (!collection) {
    return callback(new Error('No collection specified'));
  }
  collection.find(find, function(err, cursor) {
    if (err) { return callback(err); }
    if (!cursor) { return callback(new Error('Collection not found')); }
    cursor.toArray(callback);
  });
}

/**
 * Attemps to parse `string` into an ObjectId
 *
 * @param {GridReadStream} self
 * @param {String|ObjectId} string
 * @return {ObjectId|Boolean}
 */

Grid.prototype.tryParseObjectId = function tryParseObjectId (string) {
  try {
    return new this.mongo.ObjectID(string);
  } catch (_) {
    return false;
  }
}

/**
 * Attempt to set Header cache-control methods and encoding to gzip
 *
 * @param {Object} metadata
 * @param {Object} request
 * @param {Object} response
 * @return {Number}
 */

Grid.prototype.setCacheControl = function setCacheControl (metadata, request, response) {
  if (!metadata || !request || !response) { throw new Error('Grid.setCacheControl(metadata, request, response)'); }
  if (!metadata.md5 || !metadata.uploadDate || !metadata.contentType) { throw new Error('metadata should have md5, uploadDate and contentType members')}
  response.set({
      'Pragma': 'public'
    , 'Accept-Ranges': 'bytes'
    , 'Cache-Control': 'public, max-age=0'
    , 'ETag': metadata.md5
    , 'Last-Modified': new Date(metadata.uploadDate).toUTCString()
  });
  if (this._checkForCacheFromRequest(request, metadata.md5)) {
    response.setHeader('Content-Type', metadata.contentType);
    return 200;
  }
  return 304;
}

// private api

/**
 * _disableCacheFromRequest
 *
 * @api private
 */

Grid.prototype._checkForCacheFromRequest = function _checkForCacheFromRequest (request, match) {
  var cache = request.headers['cache-control'] ? request.headers['cache-control'].split(', ') : null;
  if (!cache || (cache.indexOf('no-cache') != -1) || (cache.indexOf('private') != -1)
  || (request.headers['if-none-match'] && request.headers['if-none-match'] != match)) {
    return true;
  }
  return false;
}

/**
 * expose
 */

module.exports = exports = Grid;
