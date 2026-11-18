import type {ObjectSchema,PageView,FieldSchema} from '../contracts/schema';
import type {SqlVizDataSource} from './definition';
import {DATE_RANGE_PATTERN,DATE_RANGE_PRESETS} from '../date-range-value';

export type MetricDefinition={
  kind:'metric-report';description:string;data_source:SqlVizDataSource;
  metrics:readonly {key:string;label:string;group:string;description:string}[];
  dimensions:readonly {key:string;column:string;labelColumn:string;label:string;pathColumn?:string;choices?:SqlVizDataSource}[];
  entityLabel:string;
  unknownTimeMetric?:string;
};
const object=(description:string,properties:Record<string,FieldSchema>):ObjectSchema=>({type:'object',description,properties,required:Object.keys(properties),additionalProperties:false});
const text=(description:string):FieldSchema=>({type:'string',description});
const integer=(description:string):FieldSchema=>({type:'integer',description,minimum:0});
const array=(description:string,properties:Record<string,FieldSchema>):FieldSchema=>({type:'array',description,items:object(description,properties)});
function select(description:string,values:Record<string,string>,initial:string):FieldSchema {
 return {type:'string',description,enum:Object.keys(values),default:initial,ui:{label:description,widget:'select',labels:values}};
}
export const metricPeriods={...Object.fromEntries(DATE_RANGE_PRESETS),all:'All dates'};
export function metricReport(definition:Omit<MetricDefinition,'kind'>):MetricDefinition {
 const def={kind:'metric-report' as const,...definition};assertMetricReport(def);return def;
}
export function assertMetricReport(def:MetricDefinition) {
 const valid=(key:string)=>/^[a-z_][a-z0-9_]*$/.test(key);
 if(def.data_source.kind!=='sql'||!def.data_source.sql.trim())throw new Error('Metric reports require an existing semantic SQL source.');
 for(const role of ['entity_id','entity_name','entity_url','cohort_at','event_at','metric','event_id','event_label','result','sequence'])if(!def.data_source.verified_columns[role])throw new Error(`Metric source must declare ${role}.`);
 if(!def.metrics.length||new Set(def.metrics.map(m=>m.key)).size!==def.metrics.length)throw new Error('Metric keys must be nonempty and unique.');
 if(def.unknownTimeMetric&&!def.metrics.some(m=>m.key===def.unknownTimeMetric))throw new Error('Unknown-time drilldown must name a declared metric.');
 if(!def.dimensions.length||new Set(def.dimensions.map(d=>d.key)).size!==def.dimensions.length)throw new Error('Dimension keys must be unique.');
 for(const metric of def.metrics)if(!valid(metric.key)||!metric.label||!metric.description)throw new Error('Metrics need stable keys, labels and counting rules.');
 for(const dim of def.dimensions){
  if(dim.pathColumn&&(!valid(dim.pathColumn)||!def.data_source.verified_columns[dim.pathColumn]))throw new Error('Hierarchy dimensions require a declared JSON ancestor path.');
  if(dim.choices&&(dim.choices.kind!=='sql'||!dim.choices.sql.trim()||!dim.choices.verified_columns.value||!dim.choices.verified_columns.label))throw new Error('Dimension choices require SQL with declared value and label columns.');
 }
 for(const dim of def.dimensions)if(!valid(dim.key)||!valid(dim.column)||!valid(dim.labelColumn)||!def.data_source.verified_columns[dim.column]||!def.data_source.verified_columns[dim.labelColumn])throw new Error('Dimensions must reference declared source columns.');
}
export function metricReportView(def:MetricDefinition):PageView {
 assertMetricReport(def);
 const properties:Record<string,FieldSchema>={
  period:{type:'string',description:'Inclusive calendar date range YYYY-MM-DD..YYYY-MM-DD, a named preset, or all. Evaluated in the selected time zone.',pattern:DATE_RANGE_PATTERN,default:'last_90d',ui:{label:'Period',widget:'daterange'},semantic:{format:'YYYY-MM-DD..YYYY-MM-DD (inclusive) or '+Object.keys(metricPeriods).join(', ')}},
  timeMode:select('Time basis',{activity:'Activity time',cohort:'New application cohort'},'activity'),
  timezone:select('Time zone',{'Asia/Shanghai':'Asia/Shanghai',UTC:'UTC'},'Asia/Shanghai'),
  grouping:select('Group rows by',{...Object.fromEntries(def.dimensions.map(d=>[d.key,d.label])),time:'Time',...Object.fromEntries(def.dimensions.map(d=>['time_'+d.key,'Time + '+d.label]))},def.dimensions[0].key),
  grain:select('Time grain',{month:'Month',week:'Week',day:'Day'},'month'),
 };
 const hidden=(description:string,value:string|number,max=160):FieldSchema=>typeof value==='number'
  ?{...integer(description),default:value,maximum:100000,ui:{label:description,widget:'hidden'}}
  :{...text(description),default:value,maxLength:max,ui:{label:description,widget:'hidden'}};
 for(const dim of def.dimensions)properties['filter_'+dim.key]={...text('Filter by '+dim.label),default:'',maxLength:120,ui:{label:dim.label,widget:'select',optionsFrom:'options_'+dim.key}};
 Object.assign(properties,{
  sortMetric:{...hidden('Metric used to sort every filtered group before pagination',''),enum:['',...def.metrics.map(m=>m.key)]},
  sortDirection:{...hidden('Group sort direction','desc'),enum:['asc','desc']},
  groupPage:hidden('Zero-based group page',0),metricKey:{...hidden('Selected metric',''),enum:['',...def.metrics.map(m=>m.key)]},
  groupKey:hidden('Selected group; empty means all filtered rows',''),detailPage:hidden('Zero-based entity page',0),
  evidenceEntity:hidden('Entity whose qualifying activities are expanded',''),evidencePage:hidden('Zero-based activity page',0),
  unknownTime:{type:'boolean',description:'Show qualifying events without a known event time, across all dates.',default:false,ui:{label:'Unknown event time',widget:'hidden'}},
 });
 const returns:Record<string,FieldSchema>={
  totals:array('Distinct entities for each metric',{metric:text('Metric key'),label:text('Metric label'),count:integer('Distinct entity count')}),
  groups:array('Grouped metric counts',{key:text('Stable group key'),label:text('Group label'),counts:object('Counts by metric',Object.fromEntries(def.metrics.map(m=>[m.key,integer(m.description)])))}),
  columnMax:object('Largest group count in each metric across all filtered groups, excluding Sum; fixed heatmap scale across pages',Object.fromEntries(def.metrics.map(m=>[m.key,integer('Largest group count for '+m.label)]))),
  groupTotal:integer('Total number of groups'),unknownTimeCount:integer('Distinct entities with unknown event times; excludes the date filter'),queriedAt:text('Server query time'),
  details:array('Distinct entities contributing to the selected metric',{id:text('Entity ID'),name:text('Entity name'),url:text('Business detail URL'),dimensions:text('Dimension labels'),firstMatch:text('First qualifying time, empty if unknown'),matchingEvents:integer('Number of qualifying activities')}),
  detailTotal:integer('Total distinct entities matching the selected cell'),
  evidence:array('Actual qualifying activities for the expanded entity',{id:text('Activity ID'),label:text('Activity label'),at:text('Event time, empty if unknown'),result:text('Current effective result'),sequence:text('Actual sequence number')}),
  evidenceTotal:integer('Total matching activities for the expanded entity'),
 };
 for(const dim of def.dimensions)returns['options_'+dim.key]=array('Available '+dim.label+' choices from the authorized source',{value:text('Stable value'),label:text('Display label')});
 return {description:def.description,query:Object.keys(properties),params:object('Metric report filters and actual open drilldown',properties),returns:object('Actual SQL results; counts and detail share one statement snapshot',returns),
  resetOnChange:['groupPage','metricKey','groupKey','detailPage','evidenceEntity','evidencePage','unknownTime']};
}
