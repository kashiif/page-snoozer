'use strict';

var pageSnoozer = {
	_prefService: null,
	_g: null,
	ID_CCM_SEP: 'pagesnoozer-contentcontextmenu-separator',
	ID_CCM_MENU: 'pagesnoozer-contentcontextmenu-mainmenu',
	ID_TCM_SEP: 'pagesnoozer-tabcontextmenu-separator',
	ID_TCM_MENU: 'pagesnoozer-tabcontextmenu-mainmenu',
	IDPREFIX_DURATION_MENUITEM: 'pagesnoozer-duration-',
	DURATION_DEFUALT_KEY: 'extensions.pagesnoozer.default',
	DURATION_ALL_KEY: 'extensions.pagesnoozer.all',
	lstDuration: null,
	defaultDurationIndex: null,
	scheduler:null,
	_writerTimer:null,

	handleWindowLoad: function(evt) {
		window.removeEventListener('load', pageSnoozer.handleWindowLoad);
		window.setTimeout(function() { pageSnoozer.init(); }, 500); 
	},

	init: function() {
		window.addEventListener('unload', pageSnoozer.unload, false);

		Components.utils.import('resource://page-snoozer/kashiif-shared.jsm', pageSnoozer);
		this.utils.initializeLog();
		this._prefService = this.utils._getPrefService('extensions.pagesnoozer.');
		this.utils._handleStartup();
	
		// snoozeSchduler is shared among all windows
		this.scheduler = Application.storage.get('pagesnoozer-scheduler', null);
		if (this.scheduler == null) {
			Components.utils.import('resource://page-snoozer/pagesnoozer-classes.jsm', this);

			this.scheduler = new pageSnoozer.snoozeScheduler();
			Application.storage.set('pagesnoozer-scheduler', this.scheduler);
		}

		if (typeof(gBrowser) == undefined) {
			// gBrowser is not available in Seamonkey
			this._g = doc.getElementById('content');			
		} else {
			this._g = gBrowser;
		}

		//Components.utils.import('resource://page-snoozer/pagesnoozer-classes.jsm', pageSnoozer);
		if (!this.lstDuration) {
			// load async from database
			this._loadDataAsync();
		}
	},

	unload: function(evt) {
		if (pageSnoozer._writerTimer) {
			window.clearTimeout(pageSnoozer._writerTimer);
			pageSnoozer._writerTimer = null;
			pageSnoozer._writeDataAsyncNoConflict();
		}
		pageSnoozer._g = null;
		window.removeEventListener('unload', pageSnoozer.unload);
		document.getElementById('contentAreaContextMenu').removeEventListener('popupshowing', pageSnoozer._handlePopupShowing);
		document.getElementById('tabContextMenu').removeEventListener('popupshowing', pageSnoozer._handlePopupShowing);
	},

	_loadDataAsync: function() {
		this.lstDuration = [
				//{label: '20 secs', interval: 20},
				{label: 'Snooze for an hour', interval: 60*60},
				{label: 'Snooze until tomorrow', interval: 24*60*60},
				{label: 'Snooze for a week', interval: 7*24*60*60},
				{label: 'Snooze for a month', interval: 30*24*60*60},
			];

		Application.storage.set(this.DURATION_ALL_KEY, this.lstDuration);

		this._updateUI();
	},

	_updateUI: function() {
		var item = document.getElementById(pageSnoozer.ID_CCM_SEP);
		if (!item) {
			if (this._prefService.getBoolPref('contentcontextmenu')) 
				this._populateMenu(document.getElementById('contentAreaContextMenu'), this.ID_CCM_SEP, this.ID_CCM_MENU, 'contentcontextmenu-');
			if (this._prefService.getBoolPref('tabcontextmenu')) {
				var fxMenu = document.getElementById('tabContextMenu');
				if (!fxMenu) {
					var matches = document.getElementsByAttribute('anonid', 'tabContextMenu');
					if (matches.length) 
						fxMenu = matches[0];
				}
				if (fxMenu)
					this._populateMenu(fxMenu, this.ID_TCM_SEP, this.ID_TCM_MENU, 'tabcontextmenu-');
			}
		}
	},

	_populateMenu: function(fxMenu, sepId, menuId, itemIdPrefix) {

		fxMenu.addEventListener('popupshowing', this._handlePopupShowing, false);

		var item = document.createElement('menuseparator');
		item.id = sepId;
		fxMenu.appendChild(item);

		var menu = document.createElement('menu');
		menu.id = menuId;
		menu.setAttribute('label',  'Page Snoozer'); //TODO: localize

		var menuPopup = document.createElement('menupopup');
		menuPopup.id = menuId + '-popup';

		for (var i=0; i<this.lstDuration.length; i++) {
			var objDuration = this.lstDuration[i];
			item = document.createElement('menuitem');
			item.id = this.IDPREFIX_DURATION_MENUITEM+itemIdPrefix+objDuration.interval;
			item.setAttribute('command', 'pagesnoozer-command-snooze');
			item.setAttribute('label',  objDuration.label);
			item.snoozeInterval = objDuration.interval;
			menuPopup.appendChild(item);
		}


		item = document.createElement('menuseparator');
		menuPopup.appendChild(item);

		item = document.createElement('menuitem');
		item.id = 'pagesnoozer-'+itemIdPrefix+'listsnoozes';
		item.setAttribute('command', 'pagesnoozer-command-listsnoozes');
		item.setAttribute('label',  'Show all snoozes'); //TODO: localize it
		menuPopup.appendChild(item);


		menu.appendChild(menuPopup);
		fxMenu.appendChild(menu);
	},

	_handlePopupShowing: function(evt) {
		var target = evt.target;
		var psMenu = null;
		var doc = null;
		var xulDoc = target.ownerDocument;
		if (target.id == 'contentAreaContextMenu') {
			psMenu = xulDoc.getElementById(pageSnoozer.ID_CCM_MENU);
			doc = pageSnoozer._g.selectedBrowser.contentDocument;
		}
		else if (target.id == 'tabContextMenu') {
		 	psMenu = xulDoc.getElementById(pageSnoozer.ID_TCM_MENU);
			doc = TabContextMenu.contextTab.linkedBrowser.contentDocument;
		}
		else
			return;

		var ioService = Components.classes['@mozilla.org/network/io-service;1'] 
		                  .getService(Components.interfaces.nsIIOService);

		var url = ioService.newURI(doc.location.href, doc.characterSet, null);
		var scheme = url.scheme;

		var isInvalid = !(scheme == 'http' || scheme == 'https' || scheme == 'file');

		xulDoc.getElementById('pagesnoozer-command-snooze').setAttribute('disabled', isInvalid);

	},

	handleSnoozeAddedCommand: function(evt) {
		var menuItem = evt.sourceEvent.target;
		var menuId = menuItem.parentContainer.id;
		var tab = null;


		if (menuId == this.ID_TCM_MENU) {
			tab = TabContextMenu.contextTab;
		} else if (menuId == this.ID_CCM_MENU) {
			tab = this._g.selectedTab;
		} else {
			return;
		}

		var brwsr = tab.linkedBrowser;
		var snoozeInterval = menuItem.snoozeInterval;

		var itemSnooze = new this.scheduler.snoozeItem({ 
			url:brwsr.contentDocument.location.href,
			title:brwsr.contentTitle,
			faviconUrl: tab.image,
			when:new Date(Date.now() + snoozeInterval*1000)
		});
		this.scheduler.schedule(itemSnooze);
		
		if (this._g.tabs.length == 1) {
			brwsr.loadURI( 'about:blank', null, null );
		} else {
			this._g.removeTab(tab, { animate: true });
		}
	},

	handleListSnoozesCommand: function(evt) {
		openUILinkIn('chrome://page-snoozer/content/all_snoozes.html', 'tab');
	},
}

window.addEventListener
(
  'load', 
  pageSnoozer.handleWindowLoad,
  false
);