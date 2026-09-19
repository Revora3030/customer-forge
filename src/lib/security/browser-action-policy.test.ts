import {describe,expect,it} from "vitest";
import {evaluateBrowserAction} from "./browser-action-policy";
describe("browser action policy",()=>{it("keeps payment and destructive actions behind hard approval",()=>{expect(evaluateBrowserAction("delete",{production:true,customerData:true,payment:false,explicitApproval:false}).allowed).toBe(false);expect(evaluateBrowserAction("submit",{production:false,customerData:false,payment:true,explicitApproval:true}).allowed).toBe(false);});});
