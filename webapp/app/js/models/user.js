/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

treeherder.factory('ThUserModel', [
    '$http', '$log', 'thUrl', 'thNotify', '$q',
    function($http, $log, thUrl, thNotify, $q) {

    // ThUserModel is the js counterpart of user

    var ThUserModel = function(data) {
        // creates a new instance of ThUserModel
        // using the provided properties
        angular.extend(this, data);
    };

    ThUserModel.get_uri = function(){return thUrl.getRootUrl("/user/");};

    ThUserModel.get = function() {
        // a static method to retrieve a single instance of ThUserModel
        // the primary key should be an email
        return $http.get(ThUserModel.get_uri()).then(
            function(response) {
                if(response.data.length > 0){
                    return new ThUserModel(response.data[0]);
                }else{
                    return $q.reject({"data": "User not found"});
                }
            }, function(reason){
                thNotify.send(reason.data,"danger");
                return $q.reject(reason);
            });
    };

    return ThUserModel;
}]);
