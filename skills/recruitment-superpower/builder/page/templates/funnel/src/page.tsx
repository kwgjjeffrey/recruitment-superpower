import React from 'react';
import {mountPage,usePageContext} from '@recruitment/page';
import {PageShell} from '@recruitment/page/ui';
import {MetricReport} from '@recruitment/page/viz/metrics';
import {report} from './page.viz';
import './style.css';
export const mount=mountPage(ApplicationFunnel);
function ApplicationFunnel(){
 const context=usePageContext();
 return <PageShell title={context.page.title}>
  <MetricReport definition={report}/>
 </PageShell>;
}
