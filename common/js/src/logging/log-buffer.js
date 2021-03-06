/** @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview This file contains definitions that provide the ability to keep
 * the emitted log messages for the further exporting of them.
 */

goog.provide('GoogleSmartCard.LogBuffer');

goog.require('goog.array');
goog.require('goog.debug.TextFormatter');
goog.require('goog.iter');
goog.require('goog.log.LogRecord');
goog.require('goog.log.Logger');
goog.require('goog.structs.CircularBuffer');

goog.scope(function() {

/** @const */
var GSC = GoogleSmartCard;

/**
 * This class is the log buffer that allows to keep the log messages emitted by
 * by the loggers to which it is attached.
 *
 * The main aim is to provide the ability to export the emitted log messages at
 * any time.
 *
 * The log buffer has some fixed capacity; when it's exceeded, the kept log
 * messages start to be dropped, so that only the first and the last messages
 * are preserved.
 *
 * This class is a replacement of the goog.debug.LogBuffer class. The primary
 * difference is that the latter one, when its capacity its exceeded, keeps only
 * last of the log messages, meanwhile the very first messages may also contain
 * the crucial information.
 * @param {number} capacity The maximum number of stored log messages.
 * @constructor
 */
GSC.LogBuffer = function(capacity) {
  /** @private */
  this.capacity_ = capacity;

  /** @private */
  this.size_ = 0;

  /** @private */
  this.logsPrefixCapacity_ = Math.trunc(capacity / 2);
  /**
   * @type {!Array.<string>}
   * @private
   */
  this.formattedLogsPrefix_ = [];

  /**
   * @type {!goog.structs.CircularBuffer.<string>}
   * @private
   */
  this.formattedLogsSuffix_ = new goog.structs.CircularBuffer(
      capacity - this.logsPrefixCapacity_);

  /** @private */
  this.textFormatter_ = new goog.debug.TextFormatter;
  this.textFormatter_.showAbsoluteTime = false;
  this.textFormatter_.showSeverityLevel = true;
};

/** @const */
var LogBuffer = GSC.LogBuffer;

goog.exportSymbol('GoogleSmartCard.LogBuffer', LogBuffer);

/**
 * @return {number}
 */
LogBuffer.prototype.getCapacity = function() {
  return this.capacity_;
};

goog.exportProperty(
    LogBuffer.prototype, 'getCapacity', LogBuffer.prototype.getCapacity);

/**
 * @param {!goog.log.Logger} logger
 * @param {string} documentLocationPathname
 */
LogBuffer.prototype.attachToLogger = function(
    logger, documentLocationPathname) {
  logger.addHandler(this.addLogRecord_.bind(this, documentLocationPathname));
};

goog.exportProperty(
    LogBuffer.prototype, 'attachToLogger', LogBuffer.prototype.attachToLogger);

/**
 * The structure that is used for returning the immutable snapshot of the log
 * buffer state (see the LogBuffer.prototype.getState method).
 * @param {number} logCount
 * @param {!Array.<string>} formattedLogsPrefix
 * @param {number} skippedLogCount
 * @param {!Array.<string>} formattedLogsSuffix
 * @constructor
 */
LogBuffer.State = function(
    logCount, formattedLogsPrefix, skippedLogCount, formattedLogsSuffix) {
  this['logCount'] = logCount;
  this['formattedLogsPrefix'] = formattedLogsPrefix;
  this['skippedLogCount'] = skippedLogCount;
  this['formattedLogsSuffix'] = formattedLogsSuffix;
};

goog.exportProperty(LogBuffer, 'State', LogBuffer.State);

/**
 * Returns the textual dump of the internal state.
 *
 * The dump contains the formatted log messages, together with the information
 * about the dropped log messages (if there are any).
 * @return {string}
 */
LogBuffer.State.prototype.getAsText = function() {
  var prefix = goog.iter.join(this['formattedLogsPrefix'], '');
  var suffix = goog.iter.join(this['formattedLogsSuffix'], '');

  var result = prefix;
  if (this['skippedLogCount'])
    result += '\n... skipped ' + this['skippedLogCount'] + ' messages ...\n\n';
  result += suffix;
  return result;
};

goog.exportProperty(
    LogBuffer.State.prototype,
    'getAsText',
    LogBuffer.State.prototype.getAsText);

/**
 * Returns the immutable snapshot of the log buffer state.
 *
 * The reason for this way of returning the internal state against the usual
 * accessor methods is that it's quite possible that new log messages will be
 * emitted while the client is still iterating over the kept state, which would
 * make writing a robust client code difficult.
 * @return {!LogBuffer.State}
 */
LogBuffer.prototype.getState = function() {
  return new LogBuffer.State(
      this.size_,
      goog.array.clone(this.formattedLogsPrefix_),
      this.size_ - this.formattedLogsPrefix_.length -
          this.formattedLogsSuffix_.getCount(),
      this.formattedLogsSuffix_.getValues());
};

goog.exportProperty(
    LogBuffer.prototype, 'getState', LogBuffer.prototype.getState);

/**
 * @param {string} documentLocationPathname
 * @param {!goog.log.LogRecord} logRecord
 * @private
 */
LogBuffer.prototype.addLogRecord_ = function(
    documentLocationPathname, logRecord) {
  var formattedLogRecord = this.formatLogRecord_(this.prefixLogRecord_(
      logRecord, documentLocationPathname));

  if (this.formattedLogsPrefix_.length < this.logsPrefixCapacity_)
    this.formattedLogsPrefix_.push(formattedLogRecord);
  else
    this.formattedLogsSuffix_.add(formattedLogRecord);
  ++this.size_;
};

/**
 * @param {!goog.log.LogRecord} logRecord
 * @param {string} documentLocationPathname
 * @return {!goog.log.LogRecord}
 * @private
 */
LogBuffer.prototype.prefixLogRecord_ = function(
    logRecord, documentLocationPathname) {
  var loggerNameParts = [];
  loggerNameParts.push(this.getLogMessagePrefix_(documentLocationPathname));
  if (logRecord.getLoggerName())
    loggerNameParts.push(logRecord.getLoggerName());
  var prefixedLoggerName = loggerNameParts.join('.');

  return new goog.log.LogRecord(
      logRecord.getLevel(),
      logRecord.getMessage(),
      prefixedLoggerName,
      logRecord.getMillis(),
      logRecord.getSequenceNumber());
};

/**
 * @param {!goog.log.LogRecord} logRecord
 * @return {string}
 * @private
 */
LogBuffer.prototype.formatLogRecord_ = function(logRecord) {
  return this.textFormatter_.formatRecord(logRecord);
};

/**
 * @param {string} documentLocationPathname
 * @return {string}
 * @private
 */
LogBuffer.prototype.getLogMessagePrefix_ = function(documentLocationPathname) {
  var documentTitle = documentLocationPathname;
  if (documentTitle == '/_generated_background_page.html')
    documentTitle = 'background page';
  return '<' + documentTitle + '>';
};

});  // goog.scope
