const sketch = require('sketch');
const document = sketch.getSelectedDocument();
const selection = document.selectedLayers;

var pluginName = __command.pluginBundle().name();
var debugMode = false;

var panelHeader = 44;
var panelFooter = 38;
var panelHeight = panelHeader + 448 + panelFooter;
var panelWidth = 350;
var panelGutter = 15;
var panelItems = [];

var locate = function(context) {
	if (selection.length != 1) {
		sketch.UI.alert(pluginName,'Select one symbol master or instance.');
		return false;
	}

	var selectionType = selection.layers[0].type;

	if (selectionType != 'SymbolMaster' && selectionType != 'SymbolInstance') {
		sketch.UI.alert(pluginName,'Select one symbol master or instance.');
		return false;
	}

	var symbolMaster = (selectionType == 'SymbolMaster') ? selection.layers[0] : selection.layers[0].master;
	var symbolMasterID = symbolMaster.id;
	var symbolMasterLibrary = symbolMaster.getLibrary();
	var symbolInstances = getSymbolInstances(document,symbolMaster);
	var symbolOverrides = getSymbolOverrides(document,symbolMaster);
	var symbolOverrideLayers;

	if (!symbolInstances.length && !symbolOverrides.length) {
		sketch.UI.alert(pluginName,symbolMaster.name + ' has no instances or overrides.');
		return false;
	}

	var fiber = sketch.Async.createFiber();

	var panel = createFloatingPanel(pluginName,NSMakeRect(0,0,panelWidth,panelHeight));

	var panelClose = panel.standardWindowButton(NSWindowCloseButton);

	panelClose.setCOSJSTargetFunction(function() {
		panel.close();
		fiber.cleanup();
	});

	var panelContent = createView(NSMakeRect(0,0,panelWidth,panelHeight - panelHeader));

	var symbolName = createBoldDescription(symbolMaster.name,12,NSMakeRect(8,8,panelWidth - 16,16));
	var typeSelect = createSegmentedControl(['Instances (' + symbolInstances.length + ')','Overrides (' + symbolOverrides.length + ')'],NSMakeRect(8,32,panelWidth - 16,24));
	var instanceList = createScrollView(1,NSMakeRect(0,64,panelWidth,384));
	var selectAll = createButton('Select All on Page',NSMakeRect(0,450,130,36));
	var selectMaster = (symbolMasterLibrary) ? createButton('Go to Library Master',NSMakeRect(130,450,144,36)) : createButton('Go to Master',NSMakeRect(130,450,100,36));

	[symbolName,typeSelect,instanceList,selectAll,selectMaster].forEach(i => panelContent.addSubview(i));

	selectAll.setCOSJSTargetFunction(function() {
		var scrolled = false;

		deselectTargets(panelItems);

		document.sketchObject.currentPage().changeSelectionBySelectingLayers(nil);

		var symbolType = (typeSelect.indexOfSelectedItem() == 0) ? symbolInstances : symbolOverrides;

		symbolType.forEach(function(instance,i){
			if (instance.parentPage() == document.sketchObject.currentPage()) {
				instance.select_byExtendingSelection(1,1);

				panelItems[i].setWantsLayer(1);
				panelItems[i].layer().setBorderWidth(2);
				panelItems[i].layer().setBorderColor(CGColorCreateGenericRGB(0,0,1,1));

				if (scrolled == false) {
					instanceList.subviews().firstObject().scrollPoint(NSMakePoint(0,96 * i));
					scrolled = true;
				}
			}
		});
	});

	selectMaster.setCOSJSTargetFunction(function() {
		deselectTargets(panelItems);

		if (symbolMasterLibrary) {
			sketch.Document.open(symbolMasterLibrary.sketchObject.locationOnDisk(),(err,document) => {
				if (err) {
					sketch.UI.alert(pluginName,'There was a problem opening the library.');
				}

				let symbolMaster = document.getSymbols().find(symbol => symbol.id === symbolMasterID);

				document.sketchObject.documentWindow().makeKeyAndOrderFront(null);
				document.sketchObject.setCurrentPage(symbolMaster.sketchObject.parentPage());
				document.sketchObject.contentDrawView().zoomToFitRect(symbolMaster.sketchObject.absoluteRect().rect());

				symbolMaster.sketchObject.select_byExtendingSelection(1,0);
			});
		} else {
			document.sketchObject.currentPage().changeSelectionBySelectingLayers(nil);
			document.sketchObject.setCurrentPage(symbolMaster.sketchObject.parentPage());
			document.sketchObject.contentDrawView().zoomToFitRect(symbolMaster.sketchObject.absoluteRect().rect());

			symbolMaster.sketchObject.select_byExtendingSelection(1,0);
		}
	});

	if (!symbolOverrides.length) {
		displayInstances(instanceList,symbolInstances,0);

		typeSelect.setEnabled_forSegment(0,1);
		typeSelect.setSelected_forSegment(1,0);
	} else if (!symbolInstances.length) {
		displayInstances(instanceList,symbolOverrides,1);

		typeSelect.setEnabled_forSegment(0,0);
		typeSelect.setSelected_forSegment(1,1);
	} else {
		displayInstances(instanceList,symbolInstances,0);

		typeSelect.cell().setAction('callAction:');
		typeSelect.cell().setCOSJSTargetFunction(function(sender) {
			var instances = (sender.indexOfSelectedItem() == 0) ? symbolInstances : symbolOverrides;

			displayInstances(instanceList,instances,sender.indexOfSelectedItem());
		});
	}

	panel.contentView().addSubview(panelContent);

	if (!debugMode) googleAnalytics(context,'locate','run');
}

var report = function(context) {
	openUrl('https://github.com/sonburn/symbol-instance-locator/issues/new');

	if (!debugMode) googleAnalytics(context,'report','report');
}

var plugins = function(context) {
	openUrl('https://sonburn.github.io/');

	if (!debugMode) googleAnalytics(context,'plugins','plugins');
}

var donate = function(context) {
	openUrl('https://www.paypal.me/sonburn');

	if (!debugMode) googleAnalytics(context,'donate','donate');
}

function createBoldDescription(text,size,frame,alpha) {
	var label = NSTextField.alloc().initWithFrame(frame);

	label.setStringValue(text);
	label.setFont(NSFont.boldSystemFontOfSize(size));
	label.setTextColor(NSColor.controlTextColor());
	label.setBezeled(false);
	label.setDrawsBackground(false);
	label.setEditable(false);
	label.setSelectable(false);

	return label;
}

function createButton(label,frame) {
	var button = NSButton.alloc().initWithFrame(frame);

	button.setTitle(label);
	button.setBezelStyle(NSRoundedBezelStyle);
	button.setAction('callAction:');

	return button;
}

function createDivider(frame) {
	var divider = NSView.alloc().initWithFrame(frame);

	divider.setWantsLayer(1);
	divider.layer().setBackgroundColor(isUsingDarkTheme() ? CGColorCreateGenericRGB(40/255,40/255,40/255,1.0) : CGColorCreateGenericRGB(104/255,104/255,104/255,1.0));

	return divider;
}

function createFloatingPanel(title,frame) {
	var panel = NSPanel.alloc().init();

	panel.setTitle(title);
	panel.setFrame_display(frame,true);
	panel.setStyleMask(NSTexturedBackgroundWindowMask | NSTitledWindowMask | NSClosableWindowMask | NSFullSizeContentViewWindowMask);
	panel.setBackgroundColor(NSColor.controlColor());
	panel.setBackgroundColor(NSColor.controlBackgroundColor());
	panel.setLevel(NSFloatingWindowLevel);
	panel.standardWindowButton(NSWindowMiniaturizeButton).setHidden(true);
	panel.standardWindowButton(NSWindowZoomButton).setHidden(true);
	panel.makeKeyAndOrderFront(null);
	panel.center();

	return panel;
}

function createImage(instance,frame) {
	var image = NSButton.alloc().initWithFrame(frame);

	image.setBordered(0);
	image.setWantsLayer(1);
	image.layer().setBackgroundColor(CGColorCreateGenericRGB(248/255,248/255,248/255,1.0));

	var exportRequest = MSExportRequest.exportRequestsFromExportableLayer_inRect_useIDForName_(
		instance,
		instance.absoluteInfluenceRect(),
		false
		).firstObject();

	exportRequest.format = 'png';

	var scaleX = (frame.size.width - 4 * 2) / exportRequest.rect().size.width;
	var scaleY = (frame.size.height - 4 * 2) / exportRequest.rect().size.height;

	exportRequest.scale = (scaleX < scaleY) ? scaleX : scaleY;

	var colorSpace = NSColorSpace.sRGBColorSpace();
	var exporter = MSExporter.exporterForRequest_colorSpace_(exportRequest,colorSpace);
	var imageRep = exporter.bitmapImageRep();
	var instanceImage = NSImage.alloc().init().autorelease();

	instanceImage.addRepresentation(imageRep);

	image.setImage(instanceImage);

	return image;
}

function createScrollView(border,frame) {
	var view = NSScrollView.alloc().initWithFrame(frame);

	view.setHasVerticalScroller(1);

	if (border) {
		view.addSubview(createDivider(NSMakeRect(0,0,frame.size.width,1)));
		view.addSubview(createDivider(NSMakeRect(0,frame.size.height - 1,frame.size.width,1)));
	}

	return view;
}

function createSegmentedControl(items,frame) {
	var control = NSSegmentedControl.alloc().initWithFrame(frame);

	control.setSegmentCount(items.length);

	items.forEach(function(item,index) {
		control.setLabel_forSegment(item,index);
		control.setWidth_forSegment(frame.size.width / items.length - 4,index);
	});

	control.cell().setTrackingMode(0);
	control.setSelected_forSegment(1,0);

	return control;
}

function createTarget(instance,targets,frame) {
	var target = NSButton.alloc().initWithFrame(frame);

	target.addCursorRect_cursor(target.frame(),NSCursor.pointingHandCursor());
	target.setTransparent(1);
	target.setAction('callAction:');
	target.setCOSJSTargetFunction(function(sender) {
		deselectTargets(panelItems);

		sender.setWantsLayer(1);
		sender.layer().setBorderWidth(2);
		sender.layer().setBorderColor(CGColorCreateGenericRGB(0,0,1,1));

		var rect = (instance.parentArtboard()) ? instance.parentArtboard().rect() : instance.absoluteRect().rect();

		document.sketchObject.documentWindow().makeKeyAndOrderFront(null);
		document.sketchObject.setCurrentPage(instance.parentPage());
		document.sketchObject.contentDrawView().zoomToFitRect(rect);

		instance.select_byExtendingSelection(1,0);
	});

	targets.push(target);

	return target;
}

function createTextField(string,frame) {
	var field = NSTextField.alloc().initWithFrame(frame);

	field.setStringValue(string);
	field.setFont(NSFont.systemFontOfSize(11));
	field.setBezeled(0);
	field.setEditable(0);
	field.setLineBreakMode(NSLineBreakByTruncatingTail);

	return field;
}

function createTextLabel(string,frame) {
	var field = NSTextField.alloc().initWithFrame(frame);

	field.setStringValue(string);
	field.setFont(NSFont.systemFontOfSize(9));
	field.setTextColor(NSColor.colorWithCalibratedRed_green_blue_alpha(0,0,0,0.4));
	field.setBezeled(0);
	field.setEditable(0);

	return field;
}

function createView(frame) {
	var view = NSView.alloc().initWithFrame(frame);

	view.setFlipped(1);

	return view;
}

function deselectTargets(targets) {
	targets.forEach(function(target){
		if (target.layer()) {
			target.layer().setBorderWidth(0);
			target.setWantsLayer(0);
		}
	});
}

function displayInstances(parent,instances,type) {
	panelItems = [];

	var instanceHeight = 96;
	var instanceWidth = panelWidth - panelGutter;
	var instanceContent = createView(NSMakeRect(0,0,instanceWidth,instanceHeight * instances.length));
	var leftColWidth = 140;
	var rightColPad = 8
	var rightColWidth = instanceWidth - leftColWidth - rightColPad;
	var rightColX = rightColPad + leftColWidth;
	var count = 0;

	instances.forEach(function(instance,i){
		var listItem = createView(NSMakeRect(0,instanceHeight*count,instanceWidth,instanceHeight));

		if (type) {
			var imageArea = createImage(instance,NSMakeRect(0,0,leftColWidth,instanceHeight));
			var artboardLabel = createTextLabel('Artboard',NSMakeRect(rightColX,6,rightColWidth,14));
			var artboardField = createTextField((instance.parentArtboard()) ? instance.parentArtboard().name() : 'None',NSMakeRect(rightColX,18,rightColWidth,18));
			var instanceLabel = createTextLabel('Instance',NSMakeRect(rightColX,34,rightColWidth,14));
			var instanceField = createTextField(instance.name(),NSMakeRect(rightColX,46,rightColWidth,18));
			var layerLabel = createTextLabel('Layer',NSMakeRect(rightColX,62,rightColWidth,14));
			var layerField = createTextField(symbolOverrideLayers[i],NSMakeRect(rightColX,74,rightColWidth,18));
			var targetArea = createTarget(instance,panelItems,NSMakeRect(0,0,instanceWidth,instanceHeight));
			var divider = createDivider(NSMakeRect(0,instanceHeight - 1,instanceWidth,1));

			[imageArea,artboardLabel,artboardField,instanceLabel,instanceField,layerLabel,layerField,targetArea,divider].forEach(i => listItem.addSubview(i));
		} else {
			var imageArea = createImage(instance,NSMakeRect(0,0,leftColWidth,instanceHeight));
			var pageLabel = createTextLabel('Page',NSMakeRect(rightColX,6,rightColWidth,14));
			var pageField = createTextField(instance.parentPage().name(),NSMakeRect(rightColX,18,rightColWidth,18));
			var artboardLabel = createTextLabel('Artboard',NSMakeRect(rightColX,34,rightColWidth,14));
			var artboardField = createTextField((instance.parentArtboard()) ? instance.parentArtboard().name() : 'None',NSMakeRect(rightColX,46,rightColWidth,18));
			var instanceLabel = createTextLabel('Instance',NSMakeRect(rightColX,62,rightColWidth,14));
			var instanceField = createTextField(instance.name(),NSMakeRect(rightColX,74,rightColWidth,18));
			var targetArea = createTarget(instance,panelItems,NSMakeRect(0,0,instanceWidth,instanceHeight));
			var divider = createDivider(NSMakeRect(0,instanceHeight - 1,instanceWidth,1));

			[imageArea,pageLabel,pageField,artboardLabel,artboardField,instanceLabel,instanceField,targetArea,divider].forEach(i => listItem.addSubview(i));
		}

		instanceContent.addSubview(listItem);

		count++;
	});

	parent.setDocumentView(instanceContent);
}

function getSymbolInstances(source,symbolMaster) {
	var symbolInstances = NSMutableArray.array();

	source.sketchObject.pages().forEach(function(page){
		var predicate = NSPredicate.predicateWithFormat('className == %@ && symbolMaster.objectID == %@','MSSymbolInstance',symbolMaster.sketchObject.objectID());

		page.children().filteredArrayUsingPredicate(predicate).forEach(instance => symbolInstances.addObject(instance));
	});

	return symbolInstances;
}

function getSymbolOverrides(source,symbolMaster) {
	var symbolOverrides = NSMutableArray.array();
	symbolOverrideLayers = [];

	source.sketchObject.pages().forEach(function(page){
		var predicate = NSPredicate.predicateWithFormat('className == %@ && overrides != nil && availableOverrides != nil && overrideValues != nil','MSSymbolInstance');

		page.children().filteredArrayUsingPredicate(predicate).forEach(function(instance){
			instance.availableOverrides().forEach(function(override) {
				if (override.hasOverride()) {
					if (String(override.overrideValue()) == symbolMaster.sketchObject.symbolID()) {
						symbolOverrides.addObject(instance);
						symbolOverrideLayers.push(override.affectedLayer().name());
					}

					if (override.children()) {
						override.children().forEach(function(child) {
							if (child.className() == 'MSSymbolOverride' && String(child.overrideValue()) == symbolMaster.sketchObject.symbolID()) {
								symbolOverrides.addObject(instance);
								symbolOverrideLayers.push(override.affectedLayer().name());
							}
						});
					}
				}
			});
		});
	});

	return symbolOverrides;
}

function googleAnalytics(context,category,action,label,value) {
	var trackingID = 'UA-118987499-1';
	var uuidKey = 'google.analytics.uuid';
	var uuid = NSUserDefaults.standardUserDefaults().objectForKey(uuidKey);

	if (!uuid) {
		uuid = NSUUID.UUID().UUIDString();
		NSUserDefaults.standardUserDefaults().setObject_forKey(uuid,uuidKey);
	}

	var url = 'https://www.google-analytics.com/collect?v=1';
	// Tracking ID
	url += '&tid=' + trackingID;
	// Source
	url += '&ds=sketch' + MSApplicationMetadata.metadata().appVersion;
	// Client ID
	url += '&cid=' + uuid;
	// pageview, screenview, event, transaction, item, social, exception, timing
	url += '&t=event';
	// App Name
	url += '&an=' + encodeURI(context.plugin.name());
	// App ID
	url += '&aid=' + context.plugin.identifier();
	// App Version
	url += '&av=' + context.plugin.version();
	// Event category
	url += '&ec=' + encodeURI(category);
	// Event action
	url += '&ea=' + encodeURI(action);
	// Event label
	if (label) {
		url += '&el=' + encodeURI(label);
	}
	// Event value
	if (value) {
		url += '&ev=' + encodeURI(value);
	}

	var session = NSURLSession.sharedSession();
	var task = session.dataTaskWithURL(NSURL.URLWithString(NSString.stringWithString(url)));

	task.resume();
}

function isUsingDarkTheme() {
	return (NSUserDefaults.standardUserDefaults().stringForKey("AppleInterfaceStyle") == "Dark") ? true : false;
}

function openUrl(url) {
	NSWorkspace.sharedWorkspace().openURL(NSURL.URLWithString(url));
}
