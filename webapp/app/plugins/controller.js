/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

treeherder.controller('PluginCtrl', [
    '$scope', '$rootScope', '$location', 'thUrl', 'ThJobClassificationModel',
    'thClassificationTypes', 'ThJobModel', 'thEvents', 'dateFilter',
    'numberFilter', 'ThBugJobMapModel', 'thResultStatus',
    'ThResultSetModel', 'ThLog', '$q', 'thPinboard', 'ThJobArtifactModel',
    'thBuildApi', 'thNotify', 'ThJobLogUrlModel', 'thTabs', '$timeout',
    function PluginCtrl(
        $scope, $rootScope, $location, thUrl, ThJobClassificationModel,
        thClassificationTypes, ThJobModel, thEvents, dateFilter,
        numberFilter, ThBugJobMapModel, thResultStatus,
        ThResultSetModel, ThLog, $q, thPinboard, ThJobArtifactModel,
        thBuildApi, thNotify, ThJobLogUrlModel, thTabs, $timeout) {

        var $log = new ThLog("PluginCtrl");

        $scope.job = {};
        $scope.artifacts = {};

        var setBuildernameHref = function(buildername){

            var absUrl = $location.absUrl();
            var delimiter = '?';

            // If there are parameters the parameter delimiter &
            // should be used
            if(absUrl.indexOf('?') !== -1){
                delimiter = '&';
            }

            $scope.buildbotJobnameHref = absUrl + delimiter +
                                         'filter-searchStr=' + buildername;

        };

        // this promise will void all the ajax requests
        // triggered by selectJob once resolved
        var selectJobPromise = null;
        var selectJobRetryPromise = null;

        var selectJob = function(job_id) {
            // set the scope variables needed for the job detail panel
            if (job_id) {
                $scope.job_detail_loading = true;
                if(selectJobPromise !== null){
                    $log.debug("timing out previous job request");
                    selectJobPromise.resolve();
                }
                selectJobPromise = $q.defer();

                if( selectJobRetryPromise !== null){
                    $timeout.cancel(selectJobRetryPromise);
                }
                $scope.job = {};
                $scope.artifacts = {};
                $scope.job_details = [];
                var jobDetailPromise = ThJobModel.get(
                    $scope.repoName, job_id,
                    {timeout: selectJobPromise});

                var buildapiArtifactPromise = ThJobArtifactModel.get_list(
                    {name: "buildapi", "type": "json", job_id: job_id},
                    {timeout: selectJobPromise});

                var jobInfoArtifactPromise = ThJobArtifactModel.get_list({
                    name: "Job Info", "type": "json", job_id: job_id},
                    {timeout: selectJobPromise});

                var jobLogUrlPromise = ThJobLogUrlModel.get_list(
                    job_id,
                    {timeout: selectJobPromise});

                return $q.all([
                    jobDetailPromise,
                    buildapiArtifactPromise,
                    jobInfoArtifactPromise,
                    jobLogUrlPromise
                ]).then(function(results){
                    //the first result comes from the job detail promise
                    $scope.job = results[0];
                    $scope.eta = $scope.job.get_current_eta();
                    $scope.eta_abs = Math.abs($scope.job.get_current_eta());
                    $scope.typical_eta = $scope.job.get_typical_eta();
                    // this is a bit hacky but for now talos is the only exception we have
                    if($scope.job.job_group_name.indexOf('Talos') !== -1){
                        $scope.tabService.tabs.talos.enabled = true;
                        if(thResultStatus($scope.job) === 'success'){
                            $scope.tabService.selectedTab = 'talos';
                        }else{
                            $scope.tabService.selectedTab = 'failureSummary';
                        }
                    }else{
                        $scope.tabService.tabs.talos.enabled = false;
                    }
                    // the second result come from the buildapi artifact promise
                    var buildapi_artifact = results[1];
                    if (buildapi_artifact.length > 0 &&
                        _.has(buildapi_artifact[0], 'blob')){
                        // this is needed to cancel/retrigger jobs
                        $scope.artifacts.buildapi = buildapi_artifact[0];
                        $scope.buildbotJobname = $scope.artifacts.buildapi.blob.buildername;
                        setBuildernameHref($scope.buildbotJobname);
                    }
                    // the third result comes from the job info artifact promise
                    var jobInfoArtifact = results[2];
                    if (jobInfoArtifact.length > 0) {
                        // The job artifacts may have many "Job Info" blobs so
                        // we merge them here to make displaying them in the UI
                        // easier.
                        $scope.job_details = jobInfoArtifact.reduce(function(result, artifact) {
                          if (artifact.blob && Array.isArray(artifact.blob.job_details)) {
                            result = result.concat(artifact.blob.job_details);
                          }
                          return result;
                        }, []);
                    }
                    // the fourth result comes from the jobLogUrl artifact
                    $scope.job_log_urls = results[3];
                    var logsNotParsed = [];
                    $scope.jobLogsAllParsed = _.every($scope.job_log_urls, function(jlu) {
                        if(jlu.parse_status === 'pending'){
                            logsNotParsed.push(jlu);
                            return false;
                        }else{
                            return true;
                        }
                    });
                    // retry to fetch the job info if a log hasn't been parsed yet
                    if(logsNotParsed.length > 0){
                        // first parse all the unparsed logs
                        $q.all(_.map(logsNotParsed, function(log){return log.parse();}))
                        .then(function(parseLogResponses){
                            // then retry to fetch the job info if the parse requests
                            // were successful
                            if(_.every(
                                parseLogResponses,
                                function(parseLogResponse){return parseLogResponse.status === 200;}
                            )){
                                selectJobRetryPromise = $timeout(function(){
                                    selectJobAndRender(job_id);
                                }, 5000);
                            }
                        });
                    }
                    $scope.lvUrl = thUrl.getLogViewerUrl($scope.job.id);
                    $scope.resultStatusShading = "result-status-shading-" + thResultStatus($scope.job);

                    updateVisibleFields();
                    $scope.updateClassifications();
                    $scope.updateBugs();

                    $scope.job_detail_loading = false;
                });
            }
        };

        var updateVisibleFields = function() {
                var undef = "",
                    duration = "";
                // fields that will show in the job detail panel
                $scope.visibleFields = {
                    "Job name": $scope.job.job_type_name || undef,
                    "Build": $scope.job.build_architecture + " " +
                             $scope.job.build_platform  + " " +
                             $scope.job.build_os || undef
                };
                if (_.has($scope.artifacts, "buildapi")) {
                    $scope.buildbotJobname = $scope.artifacts.buildapi.blob.buildername;
                    setBuildernameHref($scope.buildbotJobname);
                }

                // time fields to show in detail panel, but that should be grouped together
                $scope.visibleTimeFields = {
                    requestTime: dateFilter($scope.job.submit_timestamp*1000, 'short')
                };

                /*
                    display appropriate times and duration

                    If start time is 0, then duration should be from requesttime to now
                    If we have starttime and no endtime, then duration should be starttime to now
                    If we have both starttime and endtime, then duration will be between those two
                */
                var endtime = $scope.job.end_timestamp || Date.now()/1000;
                var starttime = $scope.job.start_timestamp || $scope.job.submit_timestamp;
                duration = numberFilter((endtime-starttime)/60, 0) + " minute(s)";

                $scope.visibleTimeFields.duration = duration;

                if ($scope.job.start_timestamp) {
                    $scope.visibleTimeFields.startTime = dateFilter(
                        $scope.job.start_timestamp*1000, 'short');
                }
                if ($scope.job.end_timestamp) {
                    $scope.visibleTimeFields.endTime = dateFilter(
                        $scope.job.end_timestamp*1000, 'short');
                }

        };

        $scope.getCountPinnedJobs = function() {
            return thPinboard.count.numPinnedJobs;
        };

        $scope.togglePinboardVisibility = function() {
            $scope.isPinboardVisible = !$scope.isPinboardVisible;
        };

        $scope.$watch('getCountPinnedJobs()', function(newVal, oldVal) {
            if (oldVal === 0 && newVal > 0) {
                $scope.isPinboardVisible = true;
            }
        });

        $scope.canRetrigger = function() {
            return ($scope.job && $scope.artifacts && _.has($scope.artifacts, "buildapi"));
        };

        $scope.canCancel = function() {
            return $scope.job && $scope.artifacts && _.has($scope.artifacts, "buildapi") &&
                ($scope.job.state === "pending" || $scope.job.state === "running");
        };

        /**
         * Get the build_id needed to cancel or retrigger from the currently
         * selected job.
         */
        var getRequestId = function() {
            if ($scope.artifacts.buildapi) {
                return $scope.artifacts.buildapi.blob.request_id;
            } else {
                // this is super unlikely since we'd need to have at least one of those
                // artifacts to even create the job in treeherder.  This is just a fallback...
                thNotify.send("Unable to get request id for retrigger/cancel", "danger", true);
                return null;
            }
        };

        $scope.retriggerJob = function() {
            thBuildApi.retriggerJob($scope.repoName, getRequestId());
        };

        $scope.cancelJob = function() {
            thBuildApi.cancelJob($scope.repoName, getRequestId()).then(function() {
                ThJobModel.cancel($scope.repoName, $scope.job.id);
            });
        };

        $scope.cancelAll = function(resultsetId) {
            var rs = ThResultSetModel.getResultSet($scope.repoName, resultsetId);
            thBuildApi.cancelAllJobs($scope.repoName, rs.revision);
        };

        /**
         * Test whether or not the selected job is a reftest
         */
        $scope.isReftest = function() {
            if ($scope.selectedJob) {
                return ($scope.selectedJob.job_group_name.indexOf("Reftest") !== -1);
            } else {
                return false;
            }
        };

        var selectJobAndRender = function(job_id){
            $scope.jobLoadedPromise = selectJob(job_id);
            $scope.jobLoadedPromise.then(function(){
                thTabs.showTab(thTabs.selectedTab, job_id);
            });
        };

        $rootScope.$on(thEvents.jobClick, function(event, job) {
            selectJobAndRender(job.id);
            $rootScope.selectedJob = job;
        });

        $rootScope.$on(thEvents.jobClear, function(event, job) {
            $rootScope.selectedJob = null;
            $scope.$digest();
        });

        $scope.bug_job_map_list = [];

        $scope.classificationTypes = thClassificationTypes;

        // load the list of existing classifications (including possibly a new one just
        // added).
        $scope.updateClassifications = function() {
            ThJobClassificationModel.get_list({job_id: $scope.job.id}).then(function(response) {
                $scope.classifications = response;
                $scope.job.note = $scope.classifications[0];
            });
        };

        // load the list of bug associations (including possibly new ones just
        // added).
        $scope.updateBugs = function() {
            if (_.has($scope.job, "id")) {
                ThBugJobMapModel.get_list({job_id: $scope.job.id}).then(function (response) {
                    $scope.bugs = response;
                });
            }
        };

        $rootScope.$on(thEvents.jobsClassified, function(event, job) {
            $scope.updateClassifications();
        });

        $rootScope.$on(thEvents.bugsAssociated, function(event, job) {
            $scope.updateBugs();
        });

        $scope.pinboard_service = thPinboard;

        // expose the tab service properties on the scope
        $scope.tabService = thTabs;
    }
]);
