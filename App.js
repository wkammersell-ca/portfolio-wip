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
	
	FEATURES: null,
	
	onScopeChange: function( scope ) {
		this.callParent( arguments );
		this.start( scope );
	},
	
	start: function( scope ) {
		this.removeAll();
		
		// Show loading message
		this._myMask = new Ext.LoadMask( Ext.getBody(),
			{
				msg: "Loading..."
			}
		);
		this._myMask.show();
		
		// Load the data for the Release
		var timeboxRecord = scope.record.raw;
		RELEASE_ID = timeboxRecord.ObjectID;
		START_DATE = new Date( timeboxRecord.ReleaseStartDate );
		START_DATE.setHours( 0,0,0,0 );
		END_DATE = new Date( timeboxRecord.ReleaseDate );
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
			console.log(FEATURES);
		}
		
		for ( featureItr = 0; featureItr < FEATURES.length; featureItr ++ ) {
			feature = FEATURES[ featureItr ];
			
			var dateDatum = {};
			dateDatum.date = date;
			dateDatum.total = null;
			dateDatum.progress = null;
			
			for ( recordItr = 0; recordItr < records.length; recordItr ++ ) {
				data = records[ recordItr ].data;
				var featureId = data.FormattedID;
	
				if ( feature.formattedId == featureId ) {
					dateDatum.total = data.LeafStoryPlanEstimateTotal;
					dateDatum.progress = data.AcceptedLeafStoryPlanEstimateTotal;
				}
			}
			
			feature.dateData.unshift( dateDatum );
		}
		
		
		
		// Load the next date if we're not done
		//if ( DATE_ITR >= START_DATE ) {
		if ( FEATURES[0].dateData.length <= 5 ) {
			date.setDate( date.getDate() - 1 );
			this.loadFeaturesForDate( date );
		} else {
			this.createHighChartData();
		}
	},
	
	createHighChartData: function() {
		console.log( FEATURES );
	}
		/*this._myMask.hide();
		this.removeAll();
		
		var chart = this.add({
            xtype: 'rallychart',
            loadMask: true,
            chartData: this._getChartData(),
            chartConfig: this._getChartConfig()
        });
        // TODO - Remove workaround
        // Workaround bug in setting colors - http://stackoverflow.com/questions/18361920/setting-colors-for-rally-chart-with-2-0rc1/18362186
        chart.setChartColors( [ '#F6A900', '#B81B10', '#666' ] );
	},
	
    _getChartData: function() {
        var i;
        var dates = [];
        var totals = [];
        var remainings = [];
        var ideals = [];
        var initial_scope = DATA[0].total_scope;
        
        // find the ideal velocity
        var workdays = 0;
        // TODO - could do _.each instead of for loops
        for ( i = 0; i < DATA.length; i++ ) {
			if ( !_.contains( WEEKEND_DAYS, DATA[i].date.getDay() ) ) {
				workdays = workdays + 1;
			}
        }
        var ideal_velocity = initial_scope / workdays;
        
        for ( i = 0; i < DATA.length; i++ ) {
			// set the label to the day before to show where the data was at the end of the day
			var date = new Date( DATA[i].date.valueOf() );
			date.setDate( date.getDate() - 1 );
			dates.push( date.toDateString() );
			
			if ( date < Date.now() ) {
				totals.push( DATA[i].total_scope );
				remainings.push( DATA[i].total_scope - DATA[i].completed_scope );
			} else {
				totals.push( null );
				remainings.push( null );
			}
			
			if ( i === 0 ) {
				ideals.push( initial_scope );
			} else if ( _.contains( WEEKEND_DAYS, date.getDay() ) ) {
				ideals.push( ideals[ i - 1 ] );
			} else {
				// there may be rounding on the last point that puts it below 0, so check for negative values
				var new_ideal_point = ideals[ i - 1 ] - ideal_velocity;
				if ( new_ideal_point > 0 ) {
					ideals.push( new_ideal_point );
				} else {
					ideals.push( 0 );
				}
			}
        }
        
        
        return {
            categories: dates,
            series: [
                {
                    name: 'Remaining Scope',
                    data: remainings,
                    type: 'column'				
                },
				{
                    name: 'Total Scope',
                    data: totals,
                    type: 'line',
                    lineWidth: 4	
                },
				{
                    name: 'Ideal Burndown',
                    data: ideals,
                    type: 'line',
                    dashStyle: 'longdash',
                    lineWidth: 4
                }
			]
        };
    },
	

	_getChartConfig: function() {
		return {
				chart: {
					defaultSeriesType: 'area',
					zoomType: 'xy'
				},
				title: {
					text: 'Iteration Burndown'
				},
				xAxis: {
					tickmarkPlacement: 'on',
					tickInterval: 1,
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
					series: {
						marker: {
							enabled: true,
							states: {
								hover: {
									enabled: true
								}
							}
						},
						groupPadding: 0.01
					}, 
					column: {
						stacking: null,
						shadow: false
					}
				}
		};
	} */
});