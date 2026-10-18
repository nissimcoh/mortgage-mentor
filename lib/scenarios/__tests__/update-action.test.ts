import { beforeEach, expect, it, vi } from "vitest";
import { updateScenario } from "../actions";

const mocks = vi.hoisted(() => ({ user: vi.fn(), prepare: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn(), exists: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: {getUser:mocks.user},
  from: () => ({
    update: (payload: unknown) => {
      mocks.update(payload);
      const query = {eq:(...args: unknown[])=>{mocks.eq(...args);return query;},select:mocks.select};
      return query;
    },
    select: () => {
      const query = {eq:()=>query,maybeSingle:mocks.exists};
      return query;
    },
  }),
}) }));
vi.mock("../compute", () => ({ prepareScenarioSave: mocks.prepare }));
const input = {id:"owned-scenario",name:" Renamed ",locale:"he",tracks:[],expectedUpdatedAt:"2026-10-18T10:00:00.123456+00:00"};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({data:{user:{id:"owner"}}});
  mocks.prepare.mockResolvedValue({ok:true,name:"Renamed",locale:"he",payload:{},resultSnapshot:{},marketReferences:{},calculatedAt:"2026-10-18T10:01:00Z"});
});

it("returns the database's exact new concurrency token and canonical saved name, keeping owner and old-token predicates", async () => {
  const updatedAt = "2026-10-18T10:01:00.987654+00:00";
  mocks.select.mockResolvedValue({data:[{id:input.id,updated_at:updatedAt}],error:null});
  expect(await updateScenario(input)).toEqual({ok:true,name:"Renamed",updatedAt});
  expect(mocks.select).toHaveBeenCalledWith("id, updated_at");
  expect(mocks.eq.mock.calls).toEqual([["id",input.id],["user_id","owner"],["updated_at",input.expectedUpdatedAt]]);
  expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("updated_at");
});

it.each([true,false])("keeps stale-version and missing-row errors distinct (exists=%s)", async exists => {
  mocks.select.mockResolvedValue({data:[],error:null});
  mocks.exists.mockResolvedValue({data:exists?{id:input.id}:null,error:null});
  expect(await updateScenario(input)).toEqual({ok:false,error:exists?"scenario-changed":"not-found"});
});

it("does not calculate or mutate for an unauthenticated caller", async () => {
  mocks.user.mockResolvedValue({data:{user:null}});
  expect(await updateScenario(input)).toEqual({ok:false,error:"unauthenticated"});
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
