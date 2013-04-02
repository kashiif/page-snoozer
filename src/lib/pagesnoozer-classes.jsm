'use strict';
var EXPORTED_SYMBOLS = ['snoozeScheduler'];
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

function snoozeScheduler() {

	Cu.import('resource://page-snoozer/kashiif-shared.jsm', this);
	this.utils.initializeLog();
	this.snoozes = [];
	this.timer = snoozeScheduler._createTimer();
	this._writerTimer = snoozeScheduler._createTimer();
	this.openTarget = 'tab'; // Specifies where to open snoozing item
	this.nextSnoozeIndex = -1;

	var self = this;

	this.timeoutHandler = {  
	  owner:self,
	  notify: function(timer) {  
	    this.owner.processSnoozeEvent();
	  }
	}  

	this._writerTimeoutHandler = { 
	  owner:self,
	  notify: function(timer) {  
		var content = JSON.stringify(this.owner.snoozes);
		Cu.reportError('content: ' + content);
		var file = snoozeScheduler._getDataFile();
		this.owner.utils.writeDataToFile(content, file, this._handleWrite);
	  },
	  _handleWrite: function(inputStream, status) {
		if (!Components.isSuccessCode(status)) {  
			// Handle error!
			snoozeScheduler._getWindow().alert('Page Snoozer: Failed to update snoozes list file: ' + status);
		}  
	  }
	}

	this._loadData();
}

snoozeScheduler.prototype.snoozeItem= function(props) {
	this.url = props.url;
	this.title = props.title;
	this.icon = props.faviconUrl;
	this.created = props.created? props.created: new Date();
	this.snooze = props.when;
}

snoozeScheduler.prototype.schedule = function(itmSnooze) {
	//1 day in milliseconds
	var milliSecsInOneDay=1000*60*60*24;

	//Calculate difference btw the two dates, and convert to days
	var diff = itmSnooze.snooze.getTime()-Date.now();
	var daysUntilSnooze = Math.ceil(diff/milliSecsInOneDay);

	// if itmSnooze occurs today
	//if (daysUntilSnooze == 1) {
		Cu.reportError('Scheduling: ' + itmSnooze.snooze.getTime() + ', ' + itmSnooze.url);
		// then insert it to snoozes list
		this.snoozes.push(itmSnooze);
		var isEarliest = false;

		if (this.nextSnoozeIndex >= 0) {
			var nextSnooze = this.snoozes[this.nextSnoozeIndex];
			if (itmSnooze.snooze.getTime() < nextSnooze.snooze.getTime()) {
				// occurs earlier than current next-snooze
				isEarliest = true;
			} 
		}
		else {
			// First snooze of the day
			isEarliest = true;
		}

		if (isEarliest) {
			this.nextSnoozeIndex = this.snoozes.length-1;
			this.setSnoozeTimeout(diff);	
		}

	//}
	this._writeDataAsync();
};

snoozeScheduler.prototype.removeItemAtIndex = function(index) {
	var itemToRemove = (this.snoozes.splice(index,1))[0];

	this._writeDataAsync();
	// update next snooze
	this.scheduleNext();
};

snoozeScheduler.prototype.removeAll = function() {
	this.snoozes = [];

	this.scheduleNext();
};

snoozeScheduler.prototype.processSnoozeEvent = function() {
	// do the snooze for all possible snoozes
	var itemToSnooze = (this.snoozes.splice(this.nextSnoozeIndex,1))[0];

	this._doSnooze(itemToSnooze, true);

	// update next snooze
	this.scheduleNext();
};

snoozeScheduler.prototype._doSnooze = function(itemToSnooze, persist) {
	Cu.reportError(this.snoozes.length + ' processSnoozeEvent: ' + itemToSnooze.url);
	//TODO: find all the snoozeItems having time in range +-10 secs of nextSnooze

	if (persist) {
		this._writeDataAsync();
	}

	snoozeScheduler._getWindow().openUILinkIn(itemToSnooze.url, this.openTarget);
};

snoozeScheduler._getWindow = function() {
	return Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator).getMostRecentWindow('navigator:browser');
};
snoozeScheduler._createTimer = function() {
	return Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
};

snoozeScheduler.prototype.setSnoozeTimeout = function(durationms) {
	var durationInSecs = Math.floor(durationms/1000);
	Cu.reportError('Setting timer for ' + durationInSecs + ' secs.')
	// cancel existing timeout
	this.timer.cancel();
	this.timer.initWithCallback(this.timeoutHandler, durationInSecs*1000, Ci.nsITimer.TYPE_ONE_SHOT);
};

snoozeScheduler.prototype.scheduleNext = function() {
	if (this.snoozes.length == 0) {
		this.nextSnoozeIndex = -1;
		this.timer.cancel();
		return [];
	}

	var nextSnoozeIndex = -1;
	var now = Date.now();
	var earliestTime = now;

	var expired = [];

	for (var i = 0; i < this.snoozes.length; i++) {
		var currentTime = this.snoozes[i].snooze.getTime();
		if (currentTime-now <= 0) {
			expired.push(this.snoozes[i]);
			this.snoozes.splice(i--,1);
		}
		else if (currentTime < earliestTime) {
			nextSnoozeIndex = i;
			earliestTime = currentTime;
		} 
	}

	if (nextSnoozeIndex != -1) {
		this.nextSnoozeIndex = nextSnoozeIndex;
		var duration = earliestTime-(Date.now());
		Components.utils.reportError('earliestTime: '+earliestTime+ ' Now:'+Date.now());
		this.setSnoozeTimeout(duration);
	}

	for (var i = 0; i < expired.length; i++) {
		this._doSnooze(expired[i], false);
	}

	if (expired.length) {
		this._writeDataAsync();
	}

	return expired;
}

snoozeScheduler.prototype.getAllSnoozes = function() {
	return this.snoozes.slice(0, this.snoozes.length);
};

snoozeScheduler.prototype.setSnoozes = function(lstSnoozes) {
	this.snoozes = lstSnoozes.slice(0, lstSnoozes.length);
	return this.scheduleNext();
};

snoozeScheduler.prototype._loadData = function() {
	var file = snoozeScheduler._getDataFile();

	if(file.exists()) {
		Cu.import('resource://gre/modules/NetUtil.jsm'); 	
		
		// read and populate snoozes list
		var self = this;
		NetUtil.asyncFetch(file, function(inputStream, status) { self._handleFetch(inputStream, status); });
	}
}

snoozeScheduler.prototype._handleFetch = function(inputStream, status) {
	if (!Components.isSuccessCode(status)) {
		// Handle error!
		snoozeScheduler._getWindow().alert('Page Snoozer: Error reading snoozes list file.\n.' + status); // TODO: localize it
		return;
	}

	// The file data is contained within inputStream.
	// You can read it into a string with
	var data = '';
	
	var converterStream = null;
	try {
		converterStream = Cc['@mozilla.org/intl/converter-input-stream;1']  
						   .createInstance(Ci.nsIConverterInputStream);  
		converterStream.init(inputStream, 'UTF-8', 1024, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

		var input = {};
		var numChars = 0;
		// read all "bytes" (not characters) into the input
		do {
			numChars = converterStream.readString(inputStream.available(), input);  
			data += input.value;
			//this.utils.log('numChars ' + numChars);
		} while(numChars == 1024);
	}
	catch(ex) {
		Cu.reportError('Page Snoozer: ' + ex);
		snoozeScheduler._getWindow().alert('Page Snoozer: Error reading snoozes list file.\n' + ex); // TODO: localize it
	}
	finally {
		if (converterStream) {
			try { converterStream.close(); }
			catch(ex) { Cu.reportError('Page Snoozer: Error while closing file - ' + ex); }
		}
	}

	if (data) {
		var lstSnoozes = JSON.parse(data);
		for (var i=0 ; i<lstSnoozes.length; i++) {
			var item = lstSnoozes[i];
			item.snooze = new Date(Date.parse(item.snooze));
			item.created = new Date(Date.parse(item.created));
		}

		this.snoozes = lstSnoozes;

		var expired = this.scheduleNext();
		if (expired.length) {
			this._writeDataAsync();
		}

		this.utils.log('Found Snoozes: ' + lstSnoozes.length);
	}
	else {
		this.utils.log('No Snoozes Found');
	}

};

snoozeScheduler._getDataFile = function() {
	// get profile directory  
	var file = Cc['@mozilla.org/file/directory_service;1'].getService(Ci.nsIProperties).get('ProfD', Ci.nsIFile);
	file.append('pagesnoozer');
	if( !file.exists() || !file.isDirectory() ) {
		// if it doesn't exist, create   
		file.create(Ci.nsIFile.DIRECTORY_TYPE, 0x1FF);   // 0x1FF = 0777
	}
	
	file.append('snoozes.json');
	return file;
};


snoozeScheduler.prototype._writeDataAsync = function() {
	// cancel existing timeout
	this._writerTimer.cancel();
	this._writerTimer.initWithCallback(this._writerTimeoutHandler, 300, Ci.nsITimer.TYPE_ONE_SHOT);
};