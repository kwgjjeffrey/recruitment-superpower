import type {PageSchema} from '@recruitment/page/schema';
import {metricReportView} from '@recruitment/page/viz/metrics';
import {report} from './page.viz';
export const page={asset_path:'user-page',display_name:'Application funnel',description:report.description,default_view:'main',screen:'user-page',invocation:{kind:'page',target:'recruitment',route:'/mf/user-page',handler:'mf-page'},views:{main:metricReportView(report)}} as const satisfies PageSchema;
