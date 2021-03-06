
  // Gets the proper XMLHttpRequest for support for older IE
  function getXMLHttpRequest() {
    if (root.XMLHttpRequest) {
      return new root.XMLHttpRequest();
    } else {
      var progId;
      try {
        var progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'];
        for(var i = 0; i < 3; i++) {
          try {
            progId = progIds[i];
            if (new root.ActiveXObject(progId)) {
              break;
            }
          } catch(e) { }
        }
        return new root.ActiveXObject(progId);
      } catch (e) {
        throw new Error('XMLHttpRequest is not supported by your browser');
      }
    }
  }

  // Get CORS support even for older IE
  function getCORSRequest() {
    if ('withCredentials' in root.XMLHttpRequest.prototype) {
      return new root.XMLHttpRequest();
    } else if (!!root.XDomainRequest) {
      return new XDomainRequest();
    } else {
      throw new Error('CORS is not supported by your browser');
    }
  }

  function normalizeAjaxLoadEvent(e, xhr, settings) {
    var response = ('response' in xhr) ? xhr.response :
      (settings.responseType === 'json' ? JSON.parse(xhr.responseText) : xhr.responseText);
    return {
      response: response,
      status: xhr.status,
      responseType: xhr.responseType,
      xhr: xhr,
      originalEvent: e
    };
  }

  function normalizeAjaxErrorEvent(e, xhr, type) {
    return {
      type: type,
      status: xhr.status,
      xhr: xhr,
      originalEvent: e
    };
  }

  /**
   * Creates an observable for an Ajax request with either a settings object with url, headers, etc or a string for a URL.
   *
   * @example
   *   source = Rx.DOM.ajax('/products');
   *   source = Rx.DOM.ajax( url: 'products', method: 'GET' });
   *
   * @param {Object} settings Can be one of the following:
   *
   *  A string of the URL to make the Ajax call.
   *  An object with the following properties
   *   - url: URL of the request
   *   - body: The body of the request
   *   - method: Method of the request, such as GET, POST, PUT, PATCH, DELETE
   *   - async: Whether the request is async
   *   - headers: Optional headers
   *   - crossDomain: true if a cross domain request, else false
   *
   * @returns {Observable} An observable sequence containing the XMLHttpRequest.
  */
  var ajaxRequest = dom.ajax = function (options) {
    var settings = {
      method: 'GET',
      crossDomain: false,
      contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
      async: true,
      headers: {},
      responseType: 'text'
    };

    if(typeof options === 'string') {
      settings.url = options;
    } else {
      for(var prop in options) {
        if(hasOwnProperty.call(options, prop)) {
          settings[prop] = options[prop];
        }
      }
    }

    if (!settings.crossDomain && !settings.headers['X-Requested-With']) {
      settings.headers['X-Requested-With'] = 'XMLHttpRequest';
    }
    settings.hasContent = settings.body !== undefined;

    return new AnonymousObservable(function (observer) {
      var isDone = false;

      try {
        var xhr = settings.crossDomain ? getCORSRequest() : getXMLHttpRequest();
      } catch (err) {
        observer.onError(err);
      }

      try {
        if (settings.user) {
          xhr.open(settings.method, settings.url, settings.async, settings.user, settings.password);
        } else {
          xhr.open(settings.method, settings.url, settings.async);
        }

        var headers = settings.headers;
        for (var header in headers) {
          if (hasOwnProperty.call(headers, header)) {
            xhr.setRequestHeader(header, headers[header]);
          }
        }

        if(!!xhr.upload || (!('withCredentials' in xhr) && !!root.XDomainRequest)) {
          xhr.onload = function(e) {
            if(settings.progressObserver) {
              settings.progressObserver.onNext(e);
              settings.progressObserver.onCompleted();
            }
            observer.onNext(normalizeAjaxLoadEvent(e, xhr, settings));
            observer.onCompleted();
            isDone = true;
          };

          if(settings.progressObserver) {
            xhr.onprogress = function(e) {
              settings.progressObserver.onNext(e);
            };
          }

          xhr.onerror = function(e) {
            settings.progressObserver && settings.progressObserver.onError(e);
            observer.onError(normalizeAjaxErrorEvent(e, xhr, 'error'));
            isDone = true;
          };

          xhr.onabort = function(e) {
            settings.progressObserver && settings.progressObserver.onError(e);
            observer.onError(normalizeAjaxErrorEvent(e, xhr, 'abort'));
            isDone = true;
          };
        } else {

          xhr.onreadystatechange = function (e) {
            if (xhr.readyState === 4) {
              var status = xhr.status == 1223 ? 204 : xhr.status;
              if ((status >= 200 && status <= 300) || status === 0 || status === '') {
                observer.onNext(normalizeAjaxLoadEvent(e, xhr, settings));
                observer.onCompleted();
              } else {
                observer.onError(normalizeAjaxErrorEvent(e, xhr, 'error'));
              }
              isDone = true;
            }
          };
        }

        xhr.send(settings.hasContent && settings.body || null);
      } catch (e) {
        observer.onError(e);
      }

      return function () {
        if (!isDone && xhr.readyState !== 4) { xhr.abort(); }
      };
    });
  };

  /**
   * Creates an observable sequence from an Ajax POST Request with the body.
   *
   * @param {String} url The URL to POST
   * @param {Object} body The body to POST
   * @returns {Observable} The observable sequence which contains the response from the Ajax POST.
   */
  dom.post = function (url, body) {
    return ajaxRequest({ url: url, body: body, method: 'POST' });
  };

  /**
   * Creates an observable sequence from an Ajax GET Request with the body.
   *
   * @param {String} url The URL to GET
   * @returns {Observable} The observable sequence which contains the response from the Ajax GET.
   */
  var observableGet = dom.get = function (url) {
    return ajaxRequest({ url: url });
  };

  /**
   * Creates an observable sequence from JSON from an Ajax request
   *
   * @param {String} url The URL to GET
   * @returns {Observable} The observable sequence which contains the parsed JSON.
   */
  dom.getJSON = function (url) {
    if (!root.JSON && typeof root.JSON.parse !== 'function') { throw new TypeError('JSON is not supported in your runtime.'); }
    return ajaxRequest({url: url, responseType: 'json'}).map(function (x) {
      return x.response;
    });
  };
