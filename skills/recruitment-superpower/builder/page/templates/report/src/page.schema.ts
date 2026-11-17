import type {PageSchema} from '@recruitment/page/schema';
import {vizView} from '@recruitment/page/viz';
import {report} from './page.viz';
export const page={
  asset_path:'user-page',display_name:'Recruitment Overview',description:report.description,
  default_view:'main',screen:'user-page',
  invocation:{kind:'page',target:'recruitment',route:'/mf/user-page',handler:'mf-page'},
  views:{main:vizView(report)},
} as const satisfies PageSchema;
