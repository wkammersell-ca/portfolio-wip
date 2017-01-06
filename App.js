Ext.define('CustomApp', {
	extend: 'Rally.app.TimeboxScopedApp',
	scopeType: 'release',
	WEEKEND_DAYS: [ 0, 6],
	UNCOMMITTED_SCHEDULE_STATES: [ ],
	COMPLETED_SCHEDULE_STATES: [ 'Accepted', 'Released' ],

	RELEASE_ID: null,
	DATE_ITR: null,
	START_DATE: null,
	END_DATE: null,
	RELEASE_END_DATE: null,
	FEATURES: null,
	
	onScopeChange: function( scope ) {
		this.callParent( arguments );
		this.start( scope );
	},
	
	start: function( scope ) {
		this.removeAll();
		
		// Show loading message
		this._myMask = new Ext.LoadMask( Ext.getBody(), { msg: "Loading..." } );
		this._myMask.show();
		
		// Load the data for the Release
		var timeboxRecord = scope.record.raw;
		RELEASE_ID = timeboxRecord.ObjectID;
		START_DATE = new Date( timeboxRecord.ReleaseStartDate );
		START_DATE.setHours( 0,0,0,0 );
		END_DATE = new Date( timeboxRecord.ReleaseDate );
		RELEASE_END_DATE = END_DATE;
		if ( END_DATE > new Date() ) {
			END_DATE = new Date();
		}
		END_DATE.setHours( 0,0,0,0 );
		FEATURES = [];
		
		this.loadFeaturesForDate( END_DATE );
	},
	
	loadFeaturesForDate: function( date ) {
		var snapshotStore = Ext.create( 'Rally.data.lookback.SnapshotStore', {
			fetch: ['AcceptedLeafStoryPlanEstimateTotal',
					'LeafStoryPlanEstimateTotal',
					'PortfolioItemType',
					'Recycled',
					'ActualStartDate',
					'ActualEndDate',
					'DisplayColor',
					'FormattedID',
					'Name'],
			autoLoad: true,
			listeners: {
				load: this.onFeaturesLoaded,
				scope: this
			},
			compact: true,
			context: this.getContext().getDataContext(),
			limit: Infinity,
			find: {
				Release: RELEASE_ID,
				_TypeHierarchy: "PortfolioItem",
				__At: date.toISOString()
			}
		});
	},
	
	compareFeatures: function( a, b ) {
		if ( a.actualEndDate === null && b.actualEndDate !== null ) {
			return 1;
		} else if ( a.actualEndDate < b.actualEndDate ) {
			return -1;
		} else if ( a.actualEndDate > b.actualEndDate ) {
			return 1;
		} else if ( a.actualStartDate === null && b.actualStartDate !== null ) {
			return 1;
		} else if ( a.actualStartDate < b.actualStartDate ) {
			return -1;
		} else if ( a.actualStartDate > b.actualStartDate ) {
			return 1;
		} else {
			return 0;
		}
	},
	
	onFeaturesLoaded: function( store, records ) {
		var recordItr;
		var data;
		var featureItr;
		var feature;
		var date = new Date( store.findConfig.__At );
		
		console.log(date);
		// Just track those features that were in the project at the end of the release
		if ( date.getTime() == END_DATE.getTime() ) {
			console.log( "Creating Features Array..." );
			for ( recordItr = 0; recordItr < records.length; recordItr ++ ) {
				data = records[ recordItr ].data;

				var new_feature = true;
				for ( var x = 0; x < FEATURES.length; x++ ) {
					if ( FEATURES[x].formattedId == data.FormattedID ) {
						new_feature = false;
					}
				}
		
				// Add this feature to our feature array if it's new
				if ( new_feature ) {
					feature = {};
					feature.formattedId = data.FormattedID;
					feature.name = data.Name;
					feature.actualStartDate = ( data.ActualStartDate === "" ? null : new Date( data.ActualStartDate ) );
					feature.actualEndDate = ( data.ActualEndDate === "" ? null : new Date( data.ActualEndDate ) );
					feature.displayColor = data.DisplayColor;
					feature.dateData = [];
			
					FEATURES.push( feature );
				}
			}
			FEATURES.sort( this.compareFeatures );
		}
		
		for ( featureItr = 0; featureItr < FEATURES.length; featureItr ++ ) {
			feature = FEATURES[ featureItr ];
			
			var dateDatum = {};
			dateDatum.date = date;
			dateDatum.total = 0;
			dateDatum.accepted = 0;
			
			for ( recordItr = 0; recordItr < records.length; recordItr ++ ) {
				data = records[ recordItr ].data;
				var featureId = data.FormattedID;
	
				if ( feature.formattedId == featureId ) {
					dateDatum.total = data.LeafStoryPlanEstimateTotal;
					dateDatum.accepted = data.AcceptedLeafStoryPlanEstimateTotal;
				}
			}
			
			feature.dateData.unshift( dateDatum );
		}
		
		// Load the next date if we're not done
		if ( date >= START_DATE ) {
		//if ( FEATURES[0].dateData.length <= 5 ) { // For testing, just fetch 5 dates
			date.setDate( date.getDate() - 1 );
			this.loadFeaturesForDate( date );
		} else {
			this.createHighChartData();
		}
	},
	
	createHighChartData: function() {
		console.log( FEATURES );
		
		this._myMask.hide();
		this.removeAll();
		
		var chart = this.add({
            xtype: 'rallychart',
            loadMask: true,
            chartData: this._getChartData(),
            chartConfig: this._getChartConfig()
        });

        // Workaround bug in setting colors - http://stackoverflow.com/questions/18361920/setting-colors-for-rally-chart-with-2-0rc1/18362186
        var colors = [];
        for ( var x = FEATURES.length - 1; x >= 0; x-- ) {
			colors.push( FEATURES[ x ].displayColor );
			colors.push( '#000000' );
        }
        chart.setChartColors( colors );
	},
	
    _getChartData: function() {
		var dates = [];
		var dateItr = new Date( START_DATE );
		var series = [];

		for ( var x = 0; x < FEATURES.length; x++ ) {
			var feature = FEATURES[x];

			var featureAcceptedSeries = {};
			featureAcceptedSeries.name = feature.formattedId + ': ' + feature.name + ' (Accepted Points)';
			featureAcceptedSeries.data = [];
			series.unshift( featureAcceptedSeries );
			
			var featureRemainingSeries = {};
			featureRemainingSeries.name = feature.formattedId + ': ' + feature.name + ' (Remaining Points)';
			featureRemainingSeries.data = [];
			series.unshift( featureRemainingSeries );
			
			for ( var y = 0; y < feature.dateData.length; y++ ) {
				var date = feature.dateData[y].date;
				var total = feature.dateData[y].total;
				if ( total === null ) {
					total = 0;
				}
				var accepted = feature.dateData[y].accepted;
				if ( accepted === null ) {
					accepted = 0;
				}
				
				if ( date >= feature.actualStartDate ) {
					featureAcceptedSeries.data.push( accepted );
					featureRemainingSeries.data.push( total - accepted );
				} else {
					featureAcceptedSeries.data.push( 0 );
					featureRemainingSeries.data.push( 0 );
				}
			}
		}

		while ( dateItr.getTime() <= END_DATE.getTime() ) {
			var dateString = ( dateItr.getMonth() + 1 ) + "/" + dateItr.getDate();
			dates.push( dateString );
			dateItr.setDate( dateItr.getDate() + 1 );
		}

        return {
            series: series,
            categories: dates
        };
    },
	
	_getChartConfig: function() {
		return {
			chart: {
				defaultSeriesType: 'area',
				zoomType: 'xy'
			},
			title: {
				text: 'Feature WIP'
			},
			xAxis: {
				tickmarkPlacement: 'on',
				tickInterval: 7,
				title: {
					text: 'Date',
					margin: 10
				}
			},
			yAxis: [
				{
					title: {
						text: 'Points'
					}
				}
			],
			tooltip: {
				formatter: function() {
					return '' + this.x + '<br />' + this.series.name + ': ' + this.y;
				}
			},
			plotOptions: {
				area: {
					stacking: 'normal',
					lineColor: '#666666',
					lineWidth: 1,
					marker: {
						enabled: false
					}
				}
			}
		};
	}
});