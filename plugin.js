/**
 * @license Copyright (c) 2003-2015, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or http://ckeditor.com/license
 */

'use strict';

( function() {
	CKEDITOR.plugins.add( 'fuelanchor', {
		requires: 'dialog,fakeobjects',
		lang: 'en,en-gb',
		icons: 'fuelanchor,fuelanchor-rtl',
		hidpi: true,
		onLoad: function() {
			// Add the CSS styles for anchor placeholders.
			var iconPath = CKEDITOR.getUrl( this.path + 'images' + ( CKEDITOR.env.hidpi ? '/hidpi' : '' ) + '/anchor.png' ), baseStyle = 'background:url(' + iconPath + ') no-repeat %1 center;border:1px dotted #00f;background-size:16px;';

			var template = '.%2 a.cke_anchor,' +
				'.%2 a.cke_anchor_empty' +
				',.cke_editable.%2 a[name]' +
				',.cke_editable.%2 a[data-cke-saved-name]' +
				'{' + baseStyle + 'padding-%1:18px;' + 'cursor:auto;' + '}' +
				'.%2 img.cke_anchor' +
				'{' +	baseStyle + 'width:16px;' + 'min-height:15px;' + 'height:1.15em;' + 'vertical-align:text-bottom;' + '}';

			function cssWithDir( dir ) {
				return template.replace( /%1/g, dir == 'rtl' ? 'right' : 'left' ).replace( /%2/g, 'cke_contents_' + dir );
			}

			CKEDITOR.addCss( cssWithDir( 'ltr' ) + cssWithDir( 'rtl' ) );
		},

		init: function( editor ) {
			var allowed = 'a[!href]',
				required = 'a[href]';

			// Add the link and unlink buttons.
			editor.addCommand( 'fuelanchor', new CKEDITOR.dialogCommand( 'fuelanchor', { allowedContent: 'a[!name,id]', requiredContent: 'a[name]' }) );
			editor.addCommand( 'removeAnchor', new CKEDITOR.removeAnchorCommand() );

			editor.setKeystroke( CKEDITOR.CTRL + 76 /*L*/, 'fuelanchor' );

			if ( editor.ui.addButton ) {
				editor.ui.addButton( 'Fuelanchor', {
					label: editor.lang.fuelanchor.anchor.toolbar,
					command: 'fuelanchor',
					toolbar: 'links,30'
				} );
			}

			CKEDITOR.dialog.add( 'fuelanchor', this.path + 'dialogs/fuelanchor.js' );

			editor.on( 'doubleclick', function( evt ) {
				console.log('fuelanchor double-click');
				var element = CKEDITOR.plugins.fuelanchor.getSelectedLink( editor ) || evt.data.element;

				if ( !element.isReadOnly() ) {
					if ( element.is( 'a' ) ) {
						evt.data.dialog = ( element.getAttribute( 'name' ) && ( !element.getAttribute( 'href' ) || !element.getChildCount() ) ) ? 'anchor' : '';

						// Pass the link to be selected along with event data.
						evt.data.link = element;
					} else if ( CKEDITOR.plugins.link.tryRestoreFakeAnchor( editor, element ) ) {
						evt.data.dialog = 'fuelanchor';
					}
				}
			}, null, null, 99 );

			// If event was cancelled, link passed in event data will not be selected.
//			editor.on( 'doubleclick', function( evt ) {
//				// Make sure both links and anchors are selected (#11822).
//				if ( evt.data.dialog in { link: 1, anchor: 1 } && evt.data.link )
//					editor.getSelection().selectElement( evt.data.link );
//			}, null, null, 20 );

			// If the "menu" plugin is loaded, register the menu items.
			if ( editor.addMenuItems ) {
				editor.addMenuItems( {
					anchor: {
						label: editor.lang.fuelanchor.anchor.menu,
						command: 'fuelanchor',
						group: 'anchor',
						order: 1
					},

					removeAnchor: {
						label: editor.lang.fuelanchor.anchor.remove,
						command: 'removeAnchor',
						group: 'anchor',
						order: 5
					}
				});
			}

			// If the "contextmenu" plugin is loaded, register the listeners.
			if ( editor.contextMenu ) {
				editor.contextMenu.addListener( function( element ) {
					if ( !element || element.isReadOnly() )
						return null;

					var anchor = CKEDITOR.plugins.fuelanchor.tryRestoreFakeAnchor( editor, element );

					if ( !anchor && !( anchor = CKEDITOR.plugins.fuelanchor.getSelectedLink( editor ) ) )
						return null;

					var menu = {};

					if ( anchor.getAttribute( 'href' ) && anchor.getChildCount() )
						menu = { link: CKEDITOR.TRISTATE_OFF, unlink: CKEDITOR.TRISTATE_OFF };

					if ( anchor && anchor.hasAttribute( 'name' ) )
						menu.anchor = menu.removeAnchor = CKEDITOR.TRISTATE_OFF;

					return menu;
				} );
			}

			this.compiledProtectionFunction = getCompiledProtectionFunction( editor );
		},

		afterInit: function( editor ) {
			// Empty anchors upcasting to fake objects.
			editor.dataProcessor.dataFilter.addRules( {
				elements: {
					a: function( element ) {
						if ( !element.attributes.name )
							return null;

						if ( !element.children.length )
							return editor.createFakeParserElement( element, 'cke_anchor', 'anchor' );

						return null;
					}
				}
			} );

			var pathFilters = editor._.elementsPath && editor._.elementsPath.filters;
			if ( pathFilters ) {
				pathFilters.push( function( element, name ) {
					if ( name == 'a' ) {
						if ( CKEDITOR.plugins.fuelanchor.tryRestoreFakeAnchor( editor, element ) || ( element.getAttribute( 'name' ) && ( !element.getAttribute( 'href' ) || !element.getChildCount() ) ) )
							return 'anchor';
					}
				} );
			}
		}
	} );

	// Loads the parameters in a selected link to the link dialog fields.
	var anchorRegex = /^#(.*)$/;

	var advAttrNames = {
		id: 'advId',
		dir: 'advLangDir',
		accessKey: 'advAccessKey',
		// 'data-cke-saved-name': 'advName',
		name: 'advName',
		lang: 'advLangCode',
		tabindex: 'advTabIndex',
		title: 'advTitle',
		type: 'advContentType',
		'class': 'advCSSClasses',
		charset: 'advCharset',
		style: 'advStyles',
		rel: 'advRel'
	};

	function unescapeSingleQuote( str ) {
		return str.replace( /\\'/g, '\'' );
	}

	function escapeSingleQuote( str ) {
		return str.replace( /'/g, '\\$&' );
	}

	function getCompiledProtectionFunction( editor ) {
		//NOP
		return null;
	}

	/**
	 * Set of Link plugin helpers.
	 *
	 * @class
	 * @singleton
	 */
	CKEDITOR.plugins.fuelanchor = {
		/**
		 * Get the surrounding link element of the current selection.
		 *
		 *		CKEDITOR.plugins.link.getSelectedLink( editor );
		 *
		 *		// The following selections will all return the link element.
		 *
		 *		<a href="#">li^nk</a>
		 *		<a href="#">[link]</a>
		 *		text[<a href="#">link]</a>
		 *		<a href="#">li[nk</a>]
		 *		[<b><a href="#">li]nk</a></b>]
		 *		[<a href="#"><b>li]nk</b></a>
		 *
		 * @since 3.2.1
		 * @param {CKEDITOR.editor} editor
		 */
		getSelectedLink: function( editor ) {
			var selection = editor.getSelection();
			var selectedElement = selection.getSelectedElement();
			if ( selectedElement && selectedElement.is( 'a' ) )
				return selectedElement;

			var range = selection.getRanges()[ 0 ];

			if ( range ) {
				range.shrink( CKEDITOR.SHRINK_TEXT );
				return editor.elementPath( range.getCommonAncestor() ).contains( 'a', 1 );
			}
			return null;
		},

		/**
		 * Collects anchors available in the editor (i.e. used by the Link plugin).
		 * Note that the scope of search is different for inline (the "global" document) and
		 * classic (`iframe`-based) editors (the "inner" document).
		 *
		 * @since 4.3.3
		 * @param {CKEDITOR.editor} editor
		 * @returns {CKEDITOR.dom.element[]} An array of anchor elements.
		 */
		getEditorAnchors: function( editor ) {
			var editable = editor.editable(),

				// The scope of search for anchors is the entire document for inline editors
				// and editor's editable for classic editor/divarea (#11359).
				scope = ( editable.isInline() && !editor.plugins.divarea ) ? editor.document : editable,

				links = scope.getElementsByTag( 'a' ),
				imgs = scope.getElementsByTag( 'img' ),
				anchors = [],
				i = 0,
				item;

			// Retrieve all anchors within the scope.
			while ( ( item = links.getItem( i++ ) ) ) {
				if ( item.data( 'cke-saved-name' ) || item.hasAttribute( 'name' ) ) {
					anchors.push( {
						name: item.data( 'cke-saved-name' ) || item.getAttribute( 'name' ),
						id: item.getAttribute( 'id' )
					} );
				}
			}
			// Retrieve all "fake anchors" within the scope.
			i = 0;

			while ( ( item = imgs.getItem( i++ ) ) ) {
				if ( ( item = this.tryRestoreFakeAnchor( editor, item ) ) ) {
					anchors.push( {
						name: item.getAttribute( 'name' ),
						id: item.getAttribute( 'id' )
					} );
				}
			}

			return anchors;
		},

		/**
		 * Opera and WebKit do not make it possible to select empty anchors. Fake elements must be used for them.
		 *
		 * @readonly
		 * @deprecated 4.3.3 It is set to `true` in every browser.
		 * @property {Boolean}
		 */
		fakeAnchor: true,

		/**
		 * Returns an element representing a real anchor restored from a fake anchor.
		 *
		 * @param {CKEDITOR.editor} editor
		 * @param {CKEDITOR.dom.element} element
		 * @returns {CKEDITOR.dom.element} Restored anchor element or nothing if the
		 * passed element was not a fake anchor.
		 */
		tryRestoreFakeAnchor: function( editor, element ) {
			if ( element && element.data( 'cke-real-element-type' ) && element.data( 'cke-real-element-type' ) == 'anchor' ) {
				var link = editor.restoreRealElement( element );
				if ( link.data( 'cke-saved-name' ) )
					return link;
			}
		},

		/**
		 * Parses attributes of the link element and returns an object representing
		 * the current state (data) of the link. This data format is accepted e.g. by
		 * the Link dialog window and {@link #getLinkAttributes}.
		 *
		 * @since 4.4
		 * @param {CKEDITOR.editor} editor
		 * @param {CKEDITOR.dom.element} element
		 * @returns {Object} An object of link data.
		 */
		parseLinkAttributes: function( editor, element ) {
			var href = ( element && ( element.data( 'cke-saved-href' ) || element.getAttribute( 'href' ) ) ) || '',
				compiledProtectionFunction = editor.plugins.link.compiledProtectionFunction,
				emailProtection = editor.config.emailProtection,
				javascriptMatch, emailMatch, anchorMatch, urlMatch,
				retval = {};

			if ( !retval.type ) {
				if ( ( anchorMatch = href.match( anchorRegex ) ) ) {
					retval.type = 'anchor';
					retval.anchor = {};
					retval.anchor.name = retval.anchor.id = anchorMatch[ 1 ];
				}
			}

			// Load target and popup settings.
			if ( element ) {
				var target = element.getAttribute( 'target' );

				// IE BUG: target attribute is an empty string instead of null in IE if it's not set.
				if ( !target ) {
					var onclick = element.data( 'cke-pa-onclick' ) || element.getAttribute( 'onclick' ),
						onclickMatch = onclick && onclick.match( popupRegex );

					if ( onclickMatch ) {
						retval.target = {
							type: 'popup',
							name: onclickMatch[ 1 ]
						};

						var featureMatch;
						while ( ( featureMatch = popupFeaturesRegex.exec( onclickMatch[ 2 ] ) ) ) {
							// Some values should remain numbers (#7300)
							if ( ( featureMatch[ 2 ] == 'yes' || featureMatch[ 2 ] == '1' ) && !( featureMatch[ 1 ] in { height: 1, width: 1, top: 1, left: 1 } ) )
								retval.target[ featureMatch[ 1 ] ] = true;
							else if ( isFinite( featureMatch[ 2 ] ) )
								retval.target[ featureMatch[ 1 ] ] = featureMatch[ 2 ];
						}
					}
				} else {
					retval.target = {
						type: target.match( selectableTargets ) ? target : 'frame',
						name: target
					};
				}

				var advanced = {};

				for ( var a in advAttrNames ) {
					var val = element.getAttribute( a );

					if ( val )
						advanced[ advAttrNames[ a ] ] = val;
				}

				var advName = element.data( 'cke-saved-name' ) || advanced.advName;

				if ( advName )
					advanced.advName = advName;

				if ( !CKEDITOR.tools.isEmpty( advanced ) )
					retval.advanced = advanced;
			}

			return retval;
		},

		/**
		 * Converts link data into an object which consists of attributes to be set
		 * (with their values) and an array of attributes to be removed. This method
		 * can be used to synthesise or to update any link element with the given data.
		 *
		 * @since 4.4
		 * @param {CKEDITOR.editor} editor
		 * @param {Object} data Data in {@link #parseLinkAttributes} format.
		 * @returns {Object} An object consisting of two keys, i.e.:
		 *
		 *		{
		 *			// Attributes to be set.
		 *			set: {
		 *				href: 'http://foo.bar',
		 *				target: 'bang'
		 *			},
		 *			// Attributes to be removed.
		 *			removed: [
		 *				'id', 'style'
		 *			]
		 *		}
		 *
		 */
		getLinkAttributes: function( editor, data ) {
			var emailProtection = editor.config.emailProtection || '',
				set = {};

			// Compose the URL.
			switch ( data.type ) {
				case 'anchor':
					var name = ( data.anchor && data.anchor.name ),
						id = ( data.anchor && data.anchor.id );

					set[ 'data-cke-saved-href' ] = '#' + ( name || id || '' );

					break;
			}

			// Popups and target.
			if ( data.target ) {
				if ( data.target.type == 'popup' ) {
					var onclickList = [
							'window.open(this.href, \'', data.target.name || '', '\', \''
						],
						featureList = [
							'resizable', 'status', 'location', 'toolbar', 'menubar', 'fullscreen', 'scrollbars', 'dependent'
						],
						featureLength = featureList.length,
						addFeature = function( featureName ) {
							if ( data.target[ featureName ] )
								featureList.push( featureName + '=' + data.target[ featureName ] );
						};

					for ( var i = 0; i < featureLength; i++ )
						featureList[ i ] = featureList[ i ] + ( data.target[ featureList[ i ] ] ? '=yes' : '=no' );

					addFeature( 'width' );
					addFeature( 'left' );
					addFeature( 'height' );
					addFeature( 'top' );

					onclickList.push( featureList.join( ',' ), '\'); return false;' );
					set[ 'data-cke-pa-onclick' ] = onclickList.join( '' );
				}
				else if ( data.target.type != 'notSet' && data.target.name ) {
					set.target = data.target.name;
				}
			}

			// Advanced attributes.
			if ( data.advanced ) {
				for ( var a in advAttrNames ) {
					var val = data.advanced[ advAttrNames[ a ] ];

					if ( val )
						set[ a ] = val;
				}

				if ( set.name )
					set[ 'data-cke-saved-name' ] = set.name;
			}

			// Browser need the "href" fro copy/paste link to work. (#6641)
			if ( set[ 'data-cke-saved-href' ] )
				set.href = set[ 'data-cke-saved-href' ];

			var removed = CKEDITOR.tools.extend( {
				target: 1,
				onclick: 1,
				'data-cke-pa-onclick': 1,
				'data-cke-saved-name': 1
			}, advAttrNames );

			// Remove all attributes which are not currently set.
			for ( var s in set )
				delete removed[ s ];

			return {
				set: set,
				removed: CKEDITOR.tools.objectKeys( removed )
			};
		}
	};

	// TODO Much probably there's no need to expose these as public objects.

	CKEDITOR.removeAnchorCommand = function() {};
	CKEDITOR.removeAnchorCommand.prototype = {
		exec: function( editor ) {
			var sel = editor.getSelection(),
				bms = sel.createBookmarks(),
				anchor;
			if ( sel && ( anchor = sel.getSelectedElement() ) && ( !anchor.getChildCount() ? CKEDITOR.plugins.link.tryRestoreFakeAnchor( editor, anchor ) : anchor.is( 'a' ) ) )
				anchor.remove( 1 );
			else {
				if ( ( anchor = CKEDITOR.plugins.link.getSelectedLink( editor ) ) ) {
					if ( anchor.hasAttribute( 'href' ) ) {
						anchor.removeAttributes( { name: 1, 'data-cke-saved-name': 1 } );
						anchor.removeClass( 'cke_anchor' );
					} else {
						anchor.remove( 1 );
					}
				}
			}
			sel.selectBookmarks( bms );
		},
		requiredContent: 'a[name]'
	};

	CKEDITOR.tools.extend( CKEDITOR.config, {
		linkShowAdvancedTab: true,
		linkShowTargetTab: true
	} );
} )();
