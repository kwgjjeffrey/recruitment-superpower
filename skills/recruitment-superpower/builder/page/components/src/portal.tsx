/** One theme root for the independent document and every copied popup. */
import {createContext,useContext,type ReactNode} from 'react';
const Root=createContext<HTMLElement|null>(null);
export function PortalRoot({element,children}:{element:HTMLElement;children:ReactNode}) {
  return <Root.Provider value={element}>{children}</Root.Provider>;
}
export function usePortalRoot(){return useContext(Root)??undefined;}
