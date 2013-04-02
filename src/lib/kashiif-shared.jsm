'use strict';
var EXPORTED_SYMBOLS = ['utils'];

var utils = {
	_handleStartup: function (url) {
		/*
		var oldVersion = '__version__';
		var currVersion = '__version__';
		
		try {
			oldVersion = this._prefService.getCharPref('version');
		}
		catch(e) {}
		
		if (oldVersion != currVersion) {
			this._prefService.setCharPref('version', currVersion);
			try {
				setTimeout(function() { 
					try {
						openUILinkIn( url, 'tab');
					} 
					catch(e) {}
				;},100);
			}
			catch(e) {}
		}
		*/
	},

	_getPrefService: function(key) {
		var prefService = null;
		try 
		{
			prefService = gPrefService;
		}
		catch(err)
		{
			// gPrefService not available in SeaMonkey
			prefService = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService);
		}
		
		prefService = prefService.getBranch(key);
		return prefService;
	},

	writeDataToFile: function(content, file, fptr, fmode) {
		/*******************************************************************************
		Writes data to file asynchronously.
		Parameters:
		  content - string to be written to file
		  file - nsIFile instance to which string would be written
		  fptr - function that would be invoked after write operation
		*******************************************************************************/
		
		Components.utils.import('resource://gre/modules/NetUtil.jsm'); 	
		Components.utils.import('resource://gre/modules/FileUtils.jsm'); 

		// You can also optionally pass a flags parameter here. It defaults to  
		// FileUtils.MODE_WRONLY | FileUtils.MODE_CREATE | FileUtils.MODE_TRUNCATE;  
		var ostream = FileUtils.openSafeFileOutputStream(file)  
		  
		var converter = Components.classes['@mozilla.org/intl/scriptableunicodeconverter']
							.createInstance(Components.interfaces.nsIScriptableUnicodeConverter); 
		converter.charset = 'UTF-8';  
		var istream = converter.convertToInputStream(content);  
		
		// The last argument (the callback) is optional.  
		NetUtil.asyncCopy(istream, ostream, fptr);  
	},

	initializeLog: function() {
		this.consoleService = Components.classes['@mozilla.org/consoleservice;1'].
		     getService(Components.interfaces.nsIConsoleService);
	},

	log: function(msg) {
		if (this.consoleService) {
			this.consoleService.logStringMessage(msg);
		}
	},

}