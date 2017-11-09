'use strict';
// jshint -W110
/*global chrome, Coveo, EncodeHelper, ExtensionGallery, JSONFormatter, unescape */

//The global timeout variable for the addToPage()
var addTimeOut;
//The api key
var apiKey;
//The url of the cloud platform
var url;
//Add button delay for the test buttons
var addTestButtonDelay;













/*
 * EXTENSION TESTER
 *
 */


let validateDocId = () => {
	if ($('#__testDocId').val()) {
		$('#__runTests').removeAttr('disabled');
	}
	else {
		$('#__runTests').prop('disabled', 'disabled');
	}
};

let setDocId = docId => {
	$('#__testDocId').val(docId);
	validateDocId();
};


let validateParameters = () => {
	let $ta = $('#__parametersForTest');
	let v = $ta.val().trim();
	if (!v) {
		$ta.removeClass('invalid');
	}
	else {
		try {
			JSON.parse(v);
			$ta.removeClass('invalid');
		}
		catch (e) {
			$ta.addClass('invalid');
		}
	}
};

/**
 * The onclick for the test buttons on the elements, in the Extensions page.
 *
 * @param {object} element - The row element
 */
function testButtonsOnClick(element) {
	let extId = $('.extension-name .second-row', element).text().trim();
	$('#__tab-select-document').click();
	setDocId('');
	$('#__extName').text($('.extension-name .first-row', element).text().trim());

	// Show modal
	$('#__contentModal').show();
	$('#__currentExtension').text(extId);
}


/**
 * Add test modal to page
 */
function addTestModal() {
	$.get(chrome.extension.getURL('/html/content-search.html'), function (data) {
		$('body').append(data);

		let activateTab = id => {
			$('.__selector > .tab-navigation .tab.active, .__selector > .tab-content .tab-pane.active').removeClass('active');
			$(`#${id},[data-tab=${id}]`).addClass('active');
		};
		$('.__selector > .tab-navigation .tab.enabled').on('click', data => {
			activateTab(data.target.id);
		});

		$('#__runTests').click(runTest);

		chrome.storage.local.get({
			__parameters: ''
		},
			items => {
				try {
					if (items.__parameters) {
						$('#__parametersForTest').val(JSON.stringify(JSON.parse(items.__parameters), 2, 2));
					}
				}
				catch (e) {
					$('#__parametersForTest').val('');
				}
			}
		);


		let currentOrg = getCurrentOrg();
		let modal = $('#__contentModal');
		let span = document.getElementsByClassName('__close');

		let hideModal = () => {
			modal.hide();
		};

		for (var i = 0; i < span.length; i++) {
			var element = span[i];
			element.onclick = hideModal;
		}

		modal.onclick = event => {
			if (event.target === modal) {
				hideModal();
			}
		};

		let root = document.getElementById('__orgContent');
		Coveo.SearchEndpoint.endpoints['orgContent'] = new Coveo.SearchEndpoint({
			restUri: `https://${location.host}/rest/search`,
			accessToken: getCookieApiKey(),
			anonymous: false,
			isGuestUser: false,
			queryStringArguments: {
				organizationId: currentOrg
			}
		});
		Coveo.init(root, {
			ResultLink: {
				onClick: function (e, result) {
					e.preventDefault();
					setDocId(result.uniqueId);
					resetTestEnv();
					$('#__tab-test').click();
					// Give the option to pass parameters before triggering the test
					// $('#__runTests').click();
				}
			}
		});
		let testSection = document.getElementById('__testSection');
		Coveo.init(testSection);

		$('#__testDocId').on('input', validateDocId);
		$('#__parametersForTest').on('input', validateParameters);
	});
}


/**
 * Gets the access token of the user from the document cookies
 *
 * https://stackoverflow.com/questions/5142337/read-a-javascript-cookie-by-name
 *
 * @returns The access token
 */
function getCookieApiKey() {
	let cookiestring = RegExp('' + 'access_token' + '[^;]+').exec(document.cookie);
	return decodeURIComponent(!!cookiestring ? cookiestring.toString().replace(/^[^=]+./, '') : '');
}



/**
 * Resets the results of the previous tests
 *
 */
function resetTestEnv() {
	$('#__testResults').text('');
	$('#__originalFile, #__extensionTesterErrors').html('');
}


/**
 * Runs the extension test
 *
 */
function runTest() {

	resetTestEnv();

	//Show the loading bubbles
	let loadingElement = $('#__testLoading');
	loadingElement.css('display', 'block');

	$('#__testResults').text('');
	let apiTestsKey = getCookieApiKey();
	let currentOrg = getCurrentOrg();
	let extensionId = $('#__currentExtension').text();
	let uniqueId = $('#__testDocId').val();
	let testUrl = `https://${location.host}/rest/organizations/${currentOrg}/extensions/${extensionId}/test`;
	let documentUrl = `https://${location.host}/rest/search/document?uniqueId=${encodeURIComponent(uniqueId)}&access_token=${apiTestsKey}&organizationId=${currentOrg}`;
	let extensionSettingsUrl = `https://${location.host}/rest/organizations/${currentOrg}/extensions/${extensionId}`;
	let docUri = '';
	let errorBannerElement = $('#__extensionTesterErrors');
	errorBannerElement.empty();

	let toSendData = {
		"document": {
			"permissions": [],
			"metadata": [{
				"Values": {},
				"origin": "Extension tester"
			}],
			"dataStreams": [{
				"Values": {},
				"origin": "Extension tester"
			}],
		},
		"parameters": {}
	};

	//When all of these are true, fire the extension test
	//Each will be set to true when it finishes the async
	let requestsReady = {
		'bodyText': false,
		'bodyHTML': false,
		'thumbnail': false,
		'metadata': false,
		'documentData': false
	};
	$.ajax({
		url: extensionSettingsUrl,
		headers: {
			'Authorization': `Bearer ${apiTestsKey}`,
			'Accept': 'application/json',
			'Content-Type': 'application/json'
		},
		method: 'GET',
		dataType: 'json',
		complete: function () {
			let counter = 0;
			let displayedError = false;
			function wait() {
				//Wait until all true
				let areAllRequestsCompleted = Object.keys(requestsReady).every(k => requestsReady[k]);
				if (areAllRequestsCompleted) {
					//Clears the original file selector, since we already have the extracted data
					$('#__originalFile').html('');
					runTestAjax();
				}
				else {
					counter++;
					if (counter > 500 && !displayedError) {
						addMessage('Something might have gone wrong, check the console for errors');
						displayedError = true;
					}
					setTimeout(wait, 100);
				}
			}
			wait();
		},
		success: function (data) {
			if (data.requiredDataStreams) {
				if ($.inArray('BODY_TEXT', data.requiredDataStreams) !== -1) {
					setBodyText();
				}
				else {
					requestsReady.bodyText = true;
				}

				if ($.inArray('BODY_HTML', data.requiredDataStreams) !== -1) {
					setBodyHTML();
				}
				else {
					requestsReady.bodyHTML = true;
				}

				if ($.inArray('THUMBNAIL', data.requiredDataStreams) !== -1) {
					setThumbnail();
				}
				else {
					requestsReady.thumbnail = true;
				}

				if ($.inArray('DOCUMENT_DATA', data.requiredDataStreams) !== -1) {
					addOriginalFile();
				}
				else {
					requestsReady.documentData = true;
				}
			}
			setDocumentMetadata();
		},
		error: function () {
			addMessage('Failed to fetch extension, stopping');
			loadingElement.css('display', 'none');
		}
	});



	/**
	 * Adds an original file selector
	 *
	 */
	function addOriginalFile() {
		$.get(chrome.extension.getURL('/html/originalFile.html'), function (data) {
			let originalFileElement = $('#__originalFile');
			originalFileElement.html(data);

			//Coveo things (vapor css)
			$('input[type=file]').change(function () {
				var fileValue = this.files.length ? this.files[0].name : '';
				var $input = $(this).closest('.file-input').find('.file-path');
				$input.val(fileValue);
				$input.toggleClass('has-file', !!fileValue);
				$(this).closest('.file-input').find('.clear-file').toggleClass('hidden', !fileValue);
			});
			$('.clear-file').click(function () {
				var $input = $(this).closest('.file-input');
				var $path = $input.find('.file-path');

				$input.find('input[type=file]').val('');
				$path.val('');
				$path.removeClass('hasFile');
				$(this).addClass('hidden');
			});

			let activateTab = id => {
				$('#__originalFile > .tab-navigation .tab.active, #__originalFile > .tab-content .tab-pane.active').removeClass('active');
				$(`#${id},[data-tab=${id}]`).addClass('active');
			};
			$('#__originalFile > .tab-navigation .tab.enabled').on('click', data => {
				activateTab(data.target.id);
			});
			//Coveo things

			$('#__uploadedFile').on('change', handleFileChange);
			$('#__noFile').click(function () {
				requestsReady.documentData = true;
			});
			if (docUri !== "") {
				$('#__originalLink').val(docUri);
			}
			$('#__useLinkBtn').on('click', useLinkOnClick);
		});
	}


	/**
	 * The onclick function for the 'use original link'
	 * This sends out an ajax request to the URL in question
	 * and adds the resulting HTMl to the document data of the tester
	 *
	 */
	function useLinkOnClick() {
		$.ajax({
			url: $('#__originalLink').val(),
			headers: {
				'Access-Control-Allow-Origin': '*'
			},
			method: 'GET',
			dataType: 'html',
			success: function (data) {
				toSendData.document.dataStreams[0].Values['DOCUMENT_DATA'] = {
					'inlineContent': EncodeHelper.base64(data),
					'compression': 'UNCOMPRESSED'
				};
			},
			error: function (data) {
				addMessage(`Failed to get URL content: ${data}`);
			},
			complete: function () {
				requestsReady.documentData = true;
			}

		});
	}


	/**
	 * The onchange function for the uploaded file for the original
	 * file tester.
	 *
	 * https://stackoverflow.com/questions/16505333/get-the-data-of-uploaded-file-in-javascript
	 *
	 * @param {event} evt
	 */
	function handleFileChange(evt) {
		let files = evt.target.files; // FileList object

		// use the 1st file from the list
		let f = files[0];

		let reader = new FileReader();

		// Closure to capture the file information.
		reader.addEventListener("load", function () {
			toSendData.document.dataStreams[0].Values['DOCUMENT_DATA'] = {
				'inlineContent': reader.result.split(',').slice(1).join(','),
				'compression': 'UNCOMPRESSED'
			};
			requestsReady.documentData = true;
		}, false);

		// Read in the image file as a data URL.
		reader.readAsDataURL(f);
	}

	/**
	 * Adds the Body Text data to the data to send
	 *
	 * @returns The ajax request
	 */
	function setBodyText() {
		return $.ajax({
			url: `https://${location.host}/rest/search/text?access_token=${apiTestsKey}&organizationId=${currentOrg}&uniqueId=${encodeURIComponent(uniqueId)}`,
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			method: 'GET',
			dataType: 'json',
			success: function (data) {
				if (data.content) {
					//If it find no statusCode, meaning it was successful
					if (!data.status) {
						toSendData.document.dataStreams[0].Values['BODY_TEXT'] = {
							'inlineContent': btoa(EncodeHelper.unicodeEscape(data.content)),
							'compression': 'UNCOMPRESSED'
						};
					}
					else {
						addMessage('Extension called for "Body text", but no Body Text exists for this document');
					}
				}
			},
			error: function () {
				addMessage('Extension called for "Body text", but no Body Text exists for this document');
			},
			complete: function () {
				requestsReady.bodyText = true;
			}
		});
	}


	/**
	 * Adds the HTML data to the data to send
	 *
	 * @returns The ajax request
	 */
	function setBodyHTML() {
		return $.ajax({
			url: `https://${location.host}/rest/search/html?access_token=${apiTestsKey}&organizationId=${currentOrg}&uniqueId=${encodeURIComponent(uniqueId)}`,
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			method: 'GET',
			dataType: 'html',
			success: function (data) {
				if (data) {
					//If it find no statusCode, meaning it was successful
					if (!data.status) {
						let utf8bytes = unescape(encodeURIComponent(data));
						toSendData.document.dataStreams[0].Values['BODY_HTML'] = {
							'inlineContent': btoa(utf8bytes),
							'compression': 'UNCOMPRESSED'
						};
					}
					else {
						addMessage('Extension called for "Body HTML", but no Body HTML exists for this document');
					}
				}
			},
			error: function () {
				addMessage('Extension called for "Body HTML", but no Body HTML exists for this document');
			},
			complete: function () {
				requestsReady.bodyHTML = true;
			}
		});
	}


	/**
	 * Adds the Thumbnail data to the data to send
	 *
	 */
	function setThumbnail() {

		let url = `https://${location.host}/rest/search/datastream?access_token=${apiTestsKey}&organizationId=${currentOrg}&contentType=application%2Fbinary&dataStream=%24Thumbnail%24&uniqueId=${encodeURIComponent(uniqueId)}`;

		fetchBlob(url, function (blob) {
			// Array buffer to Base64:
			if (blob) {
				let str = btoa(String.fromCharCode.apply(null, new Uint8Array(blob)));
				toSendData.document.dataStreams[0].Values['THUMBNAIL'] = {
					'inlineContent': str,
					'compression': 'UNCOMPRESSED'
				};
			}
			else {
				addMessage('Extension called for "Thumbnail", but no Thumbnail exists for this document');
			}
			requestsReady.thumbnail = true;
		});
	}


	/**
	 * Adds the metadata of the document to test to the data to send
	 *
	 * @returns The ajax request
	 */
	function setDocumentMetadata() {
		//Get the document metadata
		return $.ajax({
			url: documentUrl,
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			method: 'GET',
			dataType: 'json',
			success: function (data) {
				//StatusCode would mean an error
				if ('statusCode' in data) {
					$('#__testResults').text('Failed to fetch document\n' + JSON.stringify(data, null, 2));
					loadingElement.css('display', 'none');
				}
				else {
					docUri = data.printableUri;
					if ($('#__originalLink').length) {
						$('#__originalLink').val(docUri);
					}
					try {
						let json = JSON.parse($('#__parametersForTest').val());
						toSendData.parameters = json;
						$('#__parametersForTest').val(JSON.stringify(json, 2, 2));
						chrome.storage.local.set({ __parameters: JSON.stringify(json) });
					}
					catch (e) {
						console.warn(e);
					}

					//Build the document metadata
					console.log('PARAMETERS: ', toSendData.parameters);

					function addToJson(valueToAdd, addKey) {
						if (valueToAdd && valueToAdd.length) {
							if (valueToAdd.constructor === Array) {
								toSendData.document.metadata[0].Values[addKey] = valueToAdd;
							}
							else if (valueToAdd.constructor === Object) {
								for (let ckey in valueToAdd) {
									addToJson(valueToAdd[ckey], ckey);
								}
							}
							else {
								toSendData.document.metadata[0].Values[addKey] = [valueToAdd];
							}
						}
					}
					addToJson(data);
				}
			},
			error: function () {
				addMessage('Failed to fetch document metadata');
			},
			complete: function () {
				requestsReady.metadata = true;
			}
		});
	}


	/**
	 * Sends the ajax request to the extension tester with
	 * all the metadata added
	 *
	 */
	function runTestAjax() {
		$.ajax({
			url: testUrl,
			headers: {
				'Authorization': `Bearer ${apiTestsKey}`,
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			method: 'POST',
			dataType: 'json',
			data: JSON.stringify(toSendData, null, 0),
			complete: function (data) {
				if (data.status === 400) {
					addMessage(data.responseJSON.errorCode);
				} else if (data.responseJSON.result && data.responseJSON.result.reason) {
					data.responseJSON.result.reason = unescape(data.responseJSON.result.reason);
				}
				//$('#__testResults').text(unescape(JSON.stringify(data.responseJSON, null, 2).replace(/\\\\n/g, '\n').replace(/\\\\\\"/g, '\"')));
				let formatter = new JSONFormatter(data.responseJSON, Infinity, { hoverPreviewEnabled: false });
				$('#__testResults').html(formatter.render());
				loadingElement.css('display', 'none');
			}
		});
	}


	/**
	 * Add an error message to the test
	 *
	 * @param {string} msg - The error message
	 * @param {boolean} isWarning - True if is warning, else error
	 */
	function addMessage(msg, isWarning) {
		let message =
			`
		<div class='banner flex center-align bg-${isWarning === true ? 'yellow' : 'red'}'>
			<div class="banner-description">
				<p>${msg}</p>
			</div>
		</div>
		`;
		errorBannerElement.append(message);
	}
}


/**
 * Adds the Test buttons in the table of the extensions
 *
 */
function addTestButtonsToPage() {
	//Do this first, since it will be called multiple times
	//before the async function is done below
	//This is to ensure we don't get multiple columns
	$('#extensions').attr('__modified', true);
	if ($('#__testHeader').length === 0) {
		$($('#extensions')[0].children[0].children[0]).append('<th id="__testHeader">Tests</th>');
	}
	for (let i = 0; i < $('#extensions')[0].children[1].children.length; i++) {
		let element = $('#extensions')[0].children[1].children[i];
		//If a button is not found and there is an extension present
		if ($(element).find('.btn').length === 0 && !$(element).hasClass('empty')) {
			$(element).append(`
				<td class="col">
					<div class="wrapper">
						<div class="btn">Test</div>
					</div>
				</td>
				`);
			$(element).find('.btn').on('click', function () {
				testButtonsOnClick(element);
			});
		}
		//Changes the length of "No extensions found" TD when found to occupy space of "Tests" TH
		//Makes it look better basicly
		else if ($(element).hasClass('empty')) {
			let tdElement = $(element).find('td');
			tdElement.attr('colspan', tdElement.attr('colspan') + 1);
		}
	}
}










/*
 * OTHER
 *
 */


/**
 * The 'init' function of the script
 * Loads the values from the config and inits the mutation obs
 *
 */
window.onload = function () {
	$.get(chrome.extension.getURL('/config/config.json'), function (data) {
		data = JSON.parse(data);
		//Default values if no values are found
		chrome.storage.local.get({
			// Public key with only search enabled
			__publicApiKey: data['apiKey'],
			__searchURL: data['url']
		}, function (items) {
			apiKey = items.__publicApiKey;
			url = items.__searchURL;

			let observer = new MutationObserver(function (/*mutations, observer*/) {
				// If the EditExtensionComponent appears
				if ($('#EditExtensionComponent').length && $('#CreateExtension').length) {
					ExtensionGallery.addExtensionSearchToPage();
				}

				// If extensions appears AND it wasn't already modified by this script
				if ($('#extensions').length && !$('#extensions').attr('__modified')) {

					if (addTestButtonDelay) {
						clearTimeout(addTestButtonDelay);
					}
					addTestButtonDelay = setTimeout(function () {
						addTestButtonsToPage();
						if (!$('#__contentModal').length) {
							addTestModal();
						}

						//If a row is added later on, add the buttons
						$('#extensions').on("DOMNodeInserted", "tr", addTestButtonsToPage);
					}, 100);
				}
			});

			// define what element should be observed by the observer
			// and what types of mutations trigger the callback
			observer.observe(document, {
				subtree: true,
				attributes: true
			});
		});
	});
};




//https://stackoverflow.com/questions/23013871/how-to-parse-into-base64-string-the-binary-image-from-response
function fetchBlob(uri, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', uri, true);
	xhr.responseType = 'arraybuffer';

	xhr.onload = function () {
		if (this.status === 200) {
			var blob = this.response;
			if (callback) {
				callback(blob);
			}
		}
		else {
			if (callback) {
				callback();
			}
		}
	};
	xhr.send();
}


/**
 * Gets the current org from the url
 *
 * @returns {string} The org string
 */
function getCurrentOrg() {
	return window.location.hash.substring(1).split('/')[0];
}

