/**
 * Copyright 2020 Inrupt Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { describe, it } from "@jest/globals";
import { WithAccessibleAcr } from "../acp/acp";
import {
  AccessControlResource,
  addPolicyUrl,
  getAcrPolicyUrlAll,
  getPolicyUrlAll,
} from "../acp/control";
import {
  internal_createControl,
  internal_getAcr,
} from "../acp/control.internal";
import { addMockAcrTo } from "../acp/mock";
import {
  createPolicy,
  getPolicy,
  removePolicy,
  setAllowModes,
  setDenyModes,
  setPolicy,
} from "../acp/policy";
import {
  addForbiddenRuleUrl,
  addOptionalRuleUrl,
  addRequiredRuleUrl,
  createRule,
  getRule,
  Rule,
} from "../acp/rule";
import { acp } from "../constants";
import {
  IriString,
  ThingPersisted,
  UrlString,
  WithResourceInfo,
  WithServerResourceInfo,
} from "../interfaces";
import { mockSolidDatasetFrom } from "../resource/mock";
import { addIri, addUrl } from "../thing/add";
import { getIri, getIriAll, getUrl, getUrlAll } from "../thing/get";
import { asIri, getThing, getThingAll, setThing } from "../thing/thing";
import {
  internal_getActorAccessAll,
  internal_getActorAccess,
  internal_getAgentAccess,
  internal_getAuthenticatedAccess,
  internal_getGroupAccess,
  internal_getPublicAccess,
  internal_hasInaccessiblePolicies,
  internal_getGroupAccessAll,
  internal_getAgentAccessAll,
  internal_setActorAccess,
} from "./acp";

// Key: actor relation (e.g. agent), value: actor (e.g. a WebID)
type MockRule = Partial<
  Record<typeof acp.agent | typeof acp.group, UrlString[]>
>;

interface MockAccess {
  read: boolean;
  append: boolean;
  write: boolean;
}

type MockPolicy = {
  allOf: Record<UrlString, MockRule>;
  anyOf: Record<UrlString, MockRule>;
  noneOf: Record<UrlString, MockRule>;
  allow: Partial<MockAccess>;
  deny: Partial<MockAccess>;
};

type MockPolicies = {
  policies: Record<UrlString, Partial<MockPolicy>>;
  memberPolicies: Record<UrlString, Partial<MockPolicy>>;
  acrPolicies: Record<UrlString, Partial<MockPolicy>>;
  memberAcrPolicies: Record<UrlString, Partial<MockPolicy>>;
};

const defaultAcrUrl = "https://some.pod/policies";
const defaultMockPolicy: MockPolicy = {
  allOf: {},
  anyOf: {},
  noneOf: {},
  allow: {},
  deny: {},
};
const defaultMockPolicies: MockPolicies = {
  policies: { [`${defaultAcrUrl}"#policy`]: defaultMockPolicy },
  memberPolicies: {},
  acrPolicies: {},
  memberAcrPolicies: {},
};

function mockAcr(
  accessTo: UrlString,
  mockAcrUrl = defaultAcrUrl,
  mockPolicies: Partial<MockPolicies> = {}
): AccessControlResource {
  const allMockPolicies = {
    ...defaultMockPolicies,
    ...mockPolicies,
  };

  let acr: AccessControlResource & WithServerResourceInfo = Object.assign(
    mockSolidDatasetFrom(mockAcrUrl),
    {
      accessTo: accessTo,
    }
  );
  let control = internal_createControl({ url: mockAcrUrl });

  function getRule(mockRuleUrl: UrlString, mockRule: MockRule): Rule {
    let rule = createRule(mockRuleUrl);
    Object.entries(mockRule).forEach(([mockActorRelation, mockActors]) => {
      mockActors?.forEach((mockActor) => {
        rule = addIri(rule, mockActorRelation, mockActor);
      });
    });
    return rule;
  }
  function addPolicy(
    policyType: IriString,
    policyUrl: UrlString,
    mockPolicy: Partial<MockPolicy>
  ) {
    let policy = createPolicy(policyUrl);
    const allOfRules = mockPolicy.allOf
      ? Object.entries(mockPolicy.allOf).map(([mockRuleUrl, mockRule]) =>
          getRule(mockRuleUrl, mockRule)
        )
      : [];
    const anyOfRules = mockPolicy.anyOf
      ? Object.entries(mockPolicy.anyOf).map(([mockRuleUrl, mockRule]) =>
          getRule(mockRuleUrl, mockRule)
        )
      : [];
    const noneOfRules = mockPolicy.noneOf
      ? Object.entries(mockPolicy.noneOf).map(([mockRuleUrl, mockRule]) =>
          getRule(mockRuleUrl, mockRule)
        )
      : [];
    acr = allOfRules.reduce(setThing, acr);
    acr = anyOfRules.reduce(setThing, acr);
    acr = noneOfRules.reduce(setThing, acr);

    if (mockPolicy.allow) {
      policy = setAllowModes(policy, {
        read: mockPolicy.allow.read === true,
        append: mockPolicy.allow.append === true,
        write: mockPolicy.allow.write === true,
      });
    }
    if (mockPolicy.deny) {
      policy = setDenyModes(policy, {
        read: mockPolicy.deny.read === true,
        append: mockPolicy.deny.append === true,
        write: mockPolicy.deny.write === true,
      });
    }

    policy = allOfRules.reduce(
      (policy, rule) => addIri(policy, acp.allOf, rule),
      policy
    );
    policy = anyOfRules.reduce(
      (policy, rule) => addIri(policy, acp.anyOf, rule),
      policy
    );
    policy = noneOfRules.reduce(
      (policy, rule) => addIri(policy, acp.noneOf, rule),
      policy
    );
    acr = setThing(acr, policy);
    control = addUrl(control, policyType, policy);
  }

  Object.entries(allMockPolicies.policies).forEach(
    ([policyUrl, mockPolicy]) => {
      addPolicy(acp.apply, policyUrl, mockPolicy);
    }
  );
  Object.entries(allMockPolicies.memberPolicies).forEach(
    ([policyUrl, mockPolicy]) => {
      addPolicy(acp.applyMembers, policyUrl, mockPolicy);
    }
  );
  Object.entries(allMockPolicies.acrPolicies).forEach(
    ([policyUrl, mockPolicy]) => {
      addPolicy(acp.access, policyUrl, mockPolicy);
    }
  );
  Object.entries(allMockPolicies.memberAcrPolicies).forEach(
    ([policyUrl, mockPolicy]) => {
      addPolicy(acp.accessMembers, policyUrl, mockPolicy);
    }
  );

  acr = setThing(acr, control);

  return acr;
}
function mockResourceWithAcr(
  accessTo: UrlString,
  mockAcrUrl = defaultAcrUrl,
  mockPolicies: Partial<MockPolicies> = {}
): WithResourceInfo & WithAccessibleAcr {
  const acr = mockAcr(accessTo, mockAcrUrl, mockPolicies);

  const plainResource = mockSolidDatasetFrom(accessTo);
  return addMockAcrTo(plainResource, acr);
}

describe("hasInaccessiblePolicies", () => {
  it("returns false if the ACR contains no reference to either Policies or Rules", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/policies",
      {
        policies: {},
        memberAcrPolicies: {},
        acrPolicies: {},
        memberPolicies: {},
      }
    );
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(false);
  });

  it("returns false if the ACR only contains references to Policies within the ACR", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: { "https://some.pod/resource?ext=acr#policy": {} },
        memberAcrPolicies: {},
        acrPolicies: {},
        memberPolicies: {},
      }
    );
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(false);
  });

  it("returns true if the ACR references a Policy in a different Resource", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: { "https://some.pod/another-resource?ext=acr#policy": {} },
        memberAcrPolicies: {},
        acrPolicies: {},
        memberPolicies: {},
      }
    );
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(true);
  });

  it("returns true if the ACR references a Policy in a different Resource, and the Policy is not defined in the ACR itself too", () => {
    const plainResource = mockSolidDatasetFrom("https://some.pod/resource");
    let mockedAcr = mockAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: { "https://some.pod/another-resource?ext=acr#policy": {} },
        memberAcrPolicies: {},
        acrPolicies: {},
        memberPolicies: {},
      }
    );
    mockedAcr = removePolicy(
      mockedAcr,
      "https://some.pod/another-resource?ext=acr#policy"
    );
    const resourceWithAcr = addMockAcrTo(plainResource, mockedAcr);
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(true);
  });

  it("returns true if the ACR references an ACR Policy in a different Resource", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberAcrPolicies: {},
        acrPolicies: { "https://some.pod/another-resource?ext=acr#policy": {} },
        memberPolicies: {},
      }
    );
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(true);
  });

  it("returns false if the ACR includes an unreferenced Policy with a different Resource's URL", () => {
    const plainResource = mockSolidDatasetFrom("https://some.pod/resource");
    const policyInOtherResource = createPolicy(
      "https://some.pod/some-other-resource?ext=acr#inactive-policy"
    );
    let mockedAcr = mockAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      { policies: {} }
    );
    mockedAcr = setPolicy(mockedAcr, policyInOtherResource);
    const resourceWithAcr = addMockAcrTo(plainResource, mockedAcr);
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(false);
  });

  it("returns false if the ACR only references Rules in the same Resource", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {},
            },
          },
        },
      }
    );
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(false);
  });

  it("returns true if the ACR references an allOf Rule in a different Resource", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberAcrPolicies: {},
        acrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/other-rule-resource#rule": {},
            },
          },
        },
        memberPolicies: {},
      }
    );
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(true);
  });

  it("returns true if the ACR references an anyOf Rule in a different Resource", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberAcrPolicies: {},
        acrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            anyOf: {
              "https://some.pod/other-rule-resource#rule": {},
            },
          },
        },
        memberPolicies: {},
      }
    );
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(true);
  });

  it("returns true if the ACR references an active noneOf Rule in a different Resource", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberAcrPolicies: {},
        acrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            noneOf: {
              "https://some.pod/other-rule-resource#rule": {},
            },
          },
        },
        memberPolicies: {},
      }
    );
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(true);
  });

  it("returns false if the ACR includes an unreferenced Policy that references an allOf Rule in a different Resource", () => {
    let policyReferencingRuleInDifferentResource = createPolicy(
      "https://some.pod/resource?ext=acr#policy"
    );
    policyReferencingRuleInDifferentResource = addRequiredRuleUrl(
      policyReferencingRuleInDifferentResource,
      "https://some.pod/other-resource#rule"
    );
    const mockedAcr = setPolicy(
      mockAcr("https://some.pod/resource", "https://some.pod/resource", {
        policies: {},
      }),
      policyReferencingRuleInDifferentResource
    );
    const plainResource = mockSolidDatasetFrom("https://some.pod/resource");
    const resourceWithAcr = addMockAcrTo(plainResource, mockedAcr);
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(false);
  });

  it("returns false if the ACR includes an unreferenced Policy that references an anyOf Rule in a different Resource", () => {
    let policyReferencingRuleInDifferentResource = createPolicy(
      "https://some.pod/resource?ext=acr#policy"
    );
    policyReferencingRuleInDifferentResource = addOptionalRuleUrl(
      policyReferencingRuleInDifferentResource,
      "https://some.pod/other-resource#rule"
    );
    const mockedAcr = setPolicy(
      mockAcr("https://some.pod/resource", "https://some.pod/resource", {
        policies: {},
      }),
      policyReferencingRuleInDifferentResource
    );
    const plainResource = mockSolidDatasetFrom("https://some.pod/resource");
    const resourceWithAcr = addMockAcrTo(plainResource, mockedAcr);
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(false);
  });

  it("returns false if the ACR includes an unreferenced Policy that references a noneOf Rule in a different Resource", () => {
    let policyReferencingRuleInDifferentResource = createPolicy(
      "https://some.pod/resource?ext=acr#policy"
    );
    policyReferencingRuleInDifferentResource = addForbiddenRuleUrl(
      policyReferencingRuleInDifferentResource,
      "https://some.pod/other-resource#rule"
    );
    const mockedAcr = setPolicy(
      mockAcr("https://some.pod/resource", "https://some.pod/resource", {
        policies: {},
      }),
      policyReferencingRuleInDifferentResource
    );
    const plainResource = mockSolidDatasetFrom("https://some.pod/resource");
    const resourceWithAcr = addMockAcrTo(plainResource, mockedAcr);
    expect(internal_hasInaccessiblePolicies(resourceWithAcr)).toBe(false);
  });
});

describe("getActorAccess", () => {
  const webId = "https://some.pod/profile#me";

  it("returns undefined for all access if no access was granted to the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://arbitrary.pod/resource",
      "https://arbitrary.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns true for Read access if that was granted to the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      read: true,
    });
  });

  it("returns true for Append access if that was granted to the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { append: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      append: true,
    });
  });

  it("returns true for Write access if that was granted to the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { write: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      write: true,
    });
  });

  it("returns true for ControlRead access if that was granted to the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      controlRead: true,
    });
  });

  it("returns true for ControlWrite access if that was granted to the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { write: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      controlWrite: true,
    });
  });

  it("returns false for Read access if that was denied for the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      read: false,
    });
  });

  it("returns false for Append access if that was denied for the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { append: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      append: false,
    });
  });

  it("returns false for Write access if that was denied for the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { write: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      write: false,
    });
  });

  it("returns false for ControlRead access if that was denied for the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      controlRead: false,
    });
  });

  it("returns false for ControlWrite access if that was denied for the given actor", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { write: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      controlWrite: false,
    });
  });

  it("returns undefined for Read access if that was granted to the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for Append access if that was granted to the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { append: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for Write access if that was granted to the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { write: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for ControlRead access if that was granted to the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for ControlWrite access if that was granted to the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { write: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for Read access if that was denied for the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for Append access if that was denied for the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { append: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for Write access if that was denied for the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { write: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for ControlRead access if that was denied for the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("returns undefined for ControlWrite access if that was denied for the given actor for child Resources only", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {},
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {
          "https://some.pod/resource?ext=acr#policy": {
            deny: { write: true },
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("does not apply a Policy that does not specify any access modes", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#rule": {
                [acp.agent]: [webId],
              },
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({});
  });

  it("applies a Policy that does not specify any Rules at all", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { read: true },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      read: true,
    });
  });

  it("applies a Policy that also specifies empty Rules", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#emptyRule": {},
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      read: true,
    });
  });

  it("applies a Policy that only specifies non-existent Rules", () => {
    let mockedAcr = mockAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { read: true },
            allOf: {
              "https://some.pod/resource?ext=acr#emptyRule": {},
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );
    let policyReferencingNonExistentRules = getPolicy(
      mockedAcr,
      "https://some.pod/resource?ext=acr#policy"
    )!;
    policyReferencingNonExistentRules = addIri(
      policyReferencingNonExistentRules,
      acp.allOf,
      "https://some.pod/resource?ext=acr#emptyRule"
    );
    mockedAcr = setPolicy(mockedAcr, policyReferencingNonExistentRules);
    const plainResource = mockSolidDatasetFrom("https://some.pod/resource");
    const resourceWithAcr = addPolicyUrl(
      addMockAcrTo(plainResource, mockedAcr),
      "https://some.pod/resource?ext=acr#policy"
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toStrictEqual({
      read: true,
    });
  });

  it("returns null if some access is defined in separate Resources", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/other-resource?ext=acr#policy": {
            allow: { read: true },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

    expect(access).toBeNull();
  });

  describe("A Policy that references just the given actor in a single Rule", () => {
    it("applies for an allOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("applies for an anyOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { append: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        append: true,
      });
    });

    it("does not apply for a noneOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              noneOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { append: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });
  });

  describe("A Policy that references a Rule that applies to multiple actors, including the given one", () => {
    it("does apply for an allOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId, "https://some.pod/other-profile#me"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does apply for an anyOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId, "https://some.pod/other-profile#me"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does not apply for a noneOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId, "https://some.pod/other-profile#me"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });
  });

  describe("A Policy that references a Rule that does not include the given actor", () => {
    it("does not apply for an allOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#unapplicable-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an anyOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#unapplicable-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for a noneOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              noneOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });
  });

  describe("A Policy that references multiple of the same type of Rules, not all of which reference the given actor", () => {
    it("does not apply for allOf Rules", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#unapplicable-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does apply for anyOf Rules", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#unapplicable-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does not apply for noneOf Rules", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#unapplicable-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });
  });

  describe("A Policy that references multiple of the same type of Rules, all of which reference the given actor", () => {
    it("does apply for allOf Rules", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#non-applicable-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does apply for anyOf Rules", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#non-applicable-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does not apply for noneOf Rules", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#non-applicable-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });
  });

  describe("A Policy that references multiple Rules of a different type, all of which reference the given actor", () => {
    it("does apply for an allOf and an anyOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-anyOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does not apply for an allOf and a noneOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an anyOf and a noneOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-anyOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an allOf, an anyOf and a noneOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-anyOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });
  });

  describe("A Policy that references multiple Rules of a different type, only some of which reference the given actor", () => {
    it("does not apply for an allOf Rule with the given actor and an anyOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#unapplicable-anyOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an allOf Rule with the given actor and a noneOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#unapplicable-noneOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an anyOf Rule with the given actor and a noneOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#unapplicable-noneOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an allOf Rule with the given actor and an anyOf and a noneOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#unapplicable-noneOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#unapplicable-noneOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an anyOf Rule with the given actor and an allOf and a noneOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#unapplicable-allOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#unapplicable-noneOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for a noneOf Rule with the given actor and an allOf and an anyOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#unapplicable-allOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#unapplicable-noneOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an anyOf Rule with the given actor and an allOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#unapplicable-allOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an noneOf Rule with the given actor and an allOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#unapplicable-allOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an noneOf Rule with the given actor and an anyOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#unapplicable-allOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an allOf and an anyOf Rule with the given actor and a noneOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#unapplicable-noneOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an allOf and a noneOf Rule with the given actor and an anyOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#unapplicable-allOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });

    it("does not apply for an anyOf and a noneOf Rule with the given actor and an allOf Rule without", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#unapplicable-allOf-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#applicable-noneOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: { read: true },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({});
    });
  });

  describe("A pair of Policies that define the same Access", () => {
    it("returns the defined access for all access modes", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
                append: true,
                write: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
                append: true,
                write: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
                write: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
                write: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
    });

    it("keeps undefined access modes as `undefined`", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
        controlRead: true,
      });
    });

    it("preserves access modes from Policies using different types of Rules", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-anyOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-anyOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
        controlRead: true,
      });
    });
  });

  describe("A pair of Policies that define complementary Access", () => {
    it("returns the defined access for all access modes", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                append: true,
                write: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                write: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
    });

    it("keeps undefined access modes as `undefined`", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                append: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
        append: true,
        controlRead: true,
      });
    });

    it("preserves access modes from Policies using different types of Rules", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-anyOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                append: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              anyOf: {
                "https://some.pod/resource?ext=acr#applicable-anyOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: true,
        append: true,
        controlRead: true,
      });
    });
  });

  describe("A pair of Policies that define contradictory Access", () => {
    it("can override all access", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
                append: true,
                write: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              deny: {
                read: true,
                append: true,
                write: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
                write: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              deny: {
                read: true,
                write: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
    });

    it("has deny statements override allow statements, even if defined before them", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              deny: {
                read: true,
                append: true,
                write: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
                append: true,
                write: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              deny: {
                read: true,
                write: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
                write: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
    });

    it("leaves undefined access modes as undefined", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              deny: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
            "https://some.pod/resource?ext=acr#another-acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              deny: {
                read: true,
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const access = internal_getActorAccess(resourceWithAcr, acp.agent, webId);

      expect(access).toStrictEqual({
        read: false,
        controlRead: false,
      });
    });
  });

  describe("getAgentAccess", () => {
    it("returns access set for the given Agent", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAgentAccess(resourceWithAcr, webId);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does not return access set for a different Agent", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: ["https://arbitrary.pod/other-profile#me"],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAgentAccess(resourceWithAcr, webId);

      expect(access).toStrictEqual({});
    });

    it("does not return access set for a group", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.group]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAgentAccess(resourceWithAcr, webId);

      expect(access).toStrictEqual({});
    });

    it("does not return access set for just 'everybody' (we have getPublicAccess for that)", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [acp.PublicAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAgentAccess(resourceWithAcr, webId);

      expect(access).toStrictEqual({});
    });

    it("does not return access set for just 'all authenticated Agents' (we have getAuthenticatedAccess for that)", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [acp.AuthenticatedAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAgentAccess(resourceWithAcr, webId);

      expect(access).toStrictEqual({});
    });
  });

  describe("getGroupAccess", () => {
    const groupUrl = "https://some.pod/groups#group";

    it("returns access set for the given Group", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.group]: [groupUrl],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getGroupAccess(resourceWithAcr, groupUrl);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does not return access set for a different Group", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.group]: ["https://arbitrary.pod/groups#other-group"],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getGroupAccess(resourceWithAcr, groupUrl);

      expect(access).toStrictEqual({});
    });

    it("does not return access set for an agent", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [groupUrl],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getGroupAccess(resourceWithAcr, groupUrl);

      expect(access).toStrictEqual({});
    });
  });

  describe("getPublicAccess", () => {
    it("returns access set for the general public", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [acp.PublicAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getPublicAccess(resourceWithAcr);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does not return access set for a specific Agent", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getPublicAccess(resourceWithAcr);

      expect(access).toStrictEqual({});
    });

    it("does not return access set for a group", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.group]: [acp.PublicAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getPublicAccess(resourceWithAcr);

      expect(access).toStrictEqual({});
    });

    it("does not return access set for just 'all authenticated Agents' (we have getAuthenticatedAccess for that)", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [acp.AuthenticatedAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getPublicAccess(resourceWithAcr);

      expect(access).toStrictEqual({});
    });
  });

  describe("getAuthenticatedAccess", () => {
    it("returns access set for the authenticated Agents", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [acp.AuthenticatedAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAuthenticatedAccess(resourceWithAcr);

      expect(access).toStrictEqual({
        read: true,
      });
    });

    it("does not return access set for a specific Agent", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: ["https://arbitrary.pod/profile#me"],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAuthenticatedAccess(resourceWithAcr);

      expect(access).toStrictEqual({});
    });

    it("does not return access set for a group", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.group]: [acp.AuthenticatedAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAuthenticatedAccess(resourceWithAcr);

      expect(access).toStrictEqual({});
    });

    it("does not return access set for just 'everybody' (we have getPublicAccess for that)", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [acp.PublicAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const access = internal_getAuthenticatedAccess(resourceWithAcr);

      expect(access).toStrictEqual({});
    });
  });
});

describe("getActorAccessAll", () => {
  it.each([acp.agent, acp.group])(
    "returns an empty map if no individual %s is given access",
    (actor) => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );
      expect(internal_getActorAccessAll(resourceWithAcr, actor)).toStrictEqual(
        {}
      );
    }
  );

  it("does not return access given to individual agents for groups", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource.acr",
      {
        policies: {
          "https://some.pod/resource.acr#policy": {
            anyOf: {
              "https://some.pod/resource.acr#rule": {
                [acp.agent]: ["https://some.pod/profile#agent"],
              },
            },
            allow: {
              append: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(
      internal_getActorAccessAll(resourceWithAcr, acp.group)
    ).toStrictEqual({});
  });

  it("does not return access given to groups for agents", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource.acr",
      {
        policies: {
          "https://some.pod/resource.acr#policy": {
            anyOf: {
              "https://some.pod/resource.acr#rule": {
                [acp.group]: ["https://some.pod/profile#group"],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );
    expect(
      internal_getActorAccessAll(resourceWithAcr, acp.agent)
    ).toStrictEqual({});
  });

  it.each([acp.agent, acp.group])(
    "does not return access given to the general public for %s",
    (actor) => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource.acr",
        {
          policies: {
            "https://some.pod/resource.acr#policy": {
              anyOf: {
                "https://some.pod/resource.acr#rule": {
                  [acp.agent]: [acp.PublicAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      expect(internal_getActorAccessAll(resourceWithAcr, actor)).toStrictEqual(
        {}
      );
    }
  );

  it.each([acp.agent, acp.group])(
    "does not return access given to the Creator agent for %s",
    (actor) => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource.acr",
        {
          policies: {
            "https://some.pod/resource.acr#policy": {
              anyOf: {
                "https://some.pod/resource.acr#rule": {
                  [acp.agent]: [acp.CreatorAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      expect(internal_getActorAccessAll(resourceWithAcr, actor)).toStrictEqual(
        {}
      );
    }
  );

  it.each([acp.agent, acp.group])(
    "does not return access given to the Authenticated agent for %s",
    (actor) => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource.acr",
        {
          policies: {
            "https://some.pod/resource.acr#policy": {
              anyOf: {
                "https://some.pod/resource.acr#rule": {
                  [acp.agent]: [acp.AuthenticatedAgent],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      expect(internal_getActorAccessAll(resourceWithAcr, actor)).toStrictEqual(
        {}
      );
    }
  );

  it.each([acp.agent, acp.group])(
    "returns null if an external policy is present",
    (actor) => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource.acr",
        {
          policies: {
            "https://some.pod/another-resource.acr#policy": {
              anyOf: {
                "https://some.pod/resource.acr#rule": {
                  [actor]: ["https://some.pod/some-actor"],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );
      expect(internal_getActorAccessAll(resourceWithAcr, actor)).toBeNull();
    }
  );

  describe("One or several Policies that apply to multiple agents", () => {
    it.each([acp.agent, acp.group])(
      "returns access for all the %s that are individually given access across multiple policies",
      (actor) => {
        const resourceWithAcr = mockResourceWithAcr(
          "https://some.pod/resource",
          "https://some.pod/resource?ext=acr",
          {
            policies: {
              "https://some.pod/resource.acr#policy-a": {
                anyOf: {
                  "https://some.pod/resource.acr#rule-a": {
                    [actor]: ["https://some.pod/profile#actor-a"],
                  },
                },
                allow: {
                  read: true,
                },
              },
              "https://some.pod/resource.acr#policy-b": {
                anyOf: {
                  "https://some.pod/resource.acr#rule-b": {
                    [actor]: ["https://some.pod/profile#actor-b"],
                  },
                },
                allow: {
                  read: true,
                  write: true,
                  append: true,
                },
              },
            },
            memberPolicies: {},
            acrPolicies: {},
            memberAcrPolicies: {},
          }
        );

        expect(
          internal_getActorAccessAll(resourceWithAcr, actor)
        ).toStrictEqual({
          "https://some.pod/profile#actor-a": {
            read: true,
          },
          "https://some.pod/profile#actor-b": {
            read: true,
            append: true,
            write: true,
          },
        });
      }
    );

    it.each([acp.agent, acp.group])(
      "returns access for all the %s that are individually given access for a single policy",
      (actor) => {
        const resourceWithAcr = mockResourceWithAcr(
          "https://some.pod/resource",
          "https://some.pod/resource?ext=acr",
          {
            policies: {
              "https://some.pod/resource.acr#policy-a": {
                anyOf: {
                  "https://some.pod/resource.acr#rule-a": {
                    [actor]: [
                      "https://some.pod/profile#actor-a",
                      "https://some.pod/profile#actor-b",
                    ],
                  },
                },
                allow: {
                  read: true,
                },
              },
            },
            memberPolicies: {},
            acrPolicies: {},
            memberAcrPolicies: {},
          }
        );

        expect(
          internal_getActorAccessAll(resourceWithAcr, actor)
        ).toStrictEqual({
          "https://some.pod/profile#actor-a": {
            read: true,
          },
          "https://some.pod/profile#actor-b": {
            read: true,
          },
        });
      }
    );
  });

  describe("One or several policies applying to one agent and not to another", () => {
    it.each([acp.agent, acp.group])(
      "returns no access for Policies with a noneOf rule",
      (actor) => {
        const resourceWithAcr = mockResourceWithAcr(
          "https://some.pod/resource",
          "https://some.pod/resource.acr",
          {
            policies: {
              "https://some.pod/resource.acr#policy": {
                allOf: {
                  "https://some.pod/resource.acr#allof-rule": {
                    [actor]: ["https://some.pod/profile#included-actor"],
                  },
                },
                noneOf: {
                  "https://some.pod/resource.acr#noneof-rule": {
                    [actor]: ["https://some.pod/profile#excluded-actor"],
                  },
                },
                allow: {
                  read: true,
                },
              },
            },
            memberPolicies: {},
            acrPolicies: {},
            memberAcrPolicies: {},
          }
        );

        expect(
          internal_getActorAccessAll(resourceWithAcr, actor)
        ).toStrictEqual({
          "https://some.pod/profile#excluded-actor": {},
          "https://some.pod/profile#included-actor": {},
        });
      }
    );

    it.each([acp.agent, acp.group])(
      "returns no access for %s missing from an allOf rule",
      (actor) => {
        const resourceWithAcr = mockResourceWithAcr(
          "https://some.pod/resource",
          "https://some.pod/resource.acr",
          {
            policies: {
              "https://some.pod/resource.acr#policy": {
                allOf: {
                  "https://some.pod/resource.acr#rule": {
                    [actor]: ["https://some.pod/profile#included-actor"],
                  },
                  "https://some.pod/resource.acr#another-rule": {
                    [actor]: [
                      "https://some.pod/profile#excluded-actor",
                      "https://some.pod/profile#included-actor",
                    ],
                  },
                },
                allow: {
                  append: true,
                },
              },
            },
            memberPolicies: {},
            acrPolicies: {},
            memberAcrPolicies: {},
          }
        );

        expect(
          internal_getActorAccessAll(resourceWithAcr, actor)
        ).toStrictEqual({
          "https://some.pod/profile#included-actor": {
            append: true,
          },
          "https://some.pod/profile#excluded-actor": {},
        });
      }
    );

    it.each([acp.agent, acp.group])(
      "returns no access for %s in an anyOf rule if they are missing from an allOf rule",
      (actor) => {
        const resourceWithAcr = mockResourceWithAcr(
          "https://some.pod/resource",
          "https://some.pod/resource.acr",
          {
            policies: {
              "https://some.pod/resource.acr#policy": {
                allOf: {
                  "https://some.pod/resource.acr#rule": {
                    [actor]: [
                      "https://some.pod/profile#actor",
                      "https://some.pod/profile#a-third-actor",
                    ],
                  },
                  "https://some.pod/resource.acr#another-rule": {
                    [actor]: [
                      "https://some.pod/profile#another-actor",
                      "https://some.pod/profile#a-third-actor",
                    ],
                  },
                },
                anyOf: {
                  "https://some.pod/resource.acr#a-rule": {
                    [actor]: [
                      "https://some.pod/profile#actor",
                      "https://some.pod/profile#a-third-actor",
                    ],
                  },
                },
                allow: {
                  read: true,
                },
              },
            },
            memberPolicies: {},
            acrPolicies: {},
            memberAcrPolicies: {},
          }
        );

        expect(
          internal_getActorAccessAll(resourceWithAcr, actor)
        ).toStrictEqual({
          "https://some.pod/profile#actor": {},
          "https://some.pod/profile#another-actor": {},
          "https://some.pod/profile#a-third-actor": {
            read: true,
          },
        });
      }
    );
  });

  describe("One or several policies, some giving access and some denying access to agents", () => {
    it.each([acp.agent, acp.group])(
      "returns false for access being denied to the %s",
      (actor) => {
        const resourceWithAcr = mockResourceWithAcr(
          "https://some.pod/resource",
          "https://some.pod/resource.acr",
          {
            policies: {
              "https://some.pod/resource.acr#deny-policy": {
                anyOf: {
                  "https://some.pod/resource.acr#deny-rule": {
                    [actor]: ["https://some.pod/profile#denied-actor"],
                  },
                },
                deny: {
                  read: true,
                  write: true,
                },
              },
              "https://some.pod/resource.acr#allow-policy": {
                anyOf: {
                  "https://some.pod/resource.acr#allow-rule": {
                    [actor]: ["https://some.pod/profile#allowed-actor"],
                  },
                },
                allow: {
                  read: true,
                  write: true,
                },
              },
            },
            memberPolicies: {},
            acrPolicies: {},
            memberAcrPolicies: {},
          }
        );

        expect(
          internal_getActorAccessAll(resourceWithAcr, actor)
        ).toStrictEqual({
          "https://some.pod/profile#denied-actor": {
            read: false,
            write: false,
          },
          "https://some.pod/profile#allowed-actor": {
            read: true,
            write: true,
          },
        });
      }
    );

    it.each([acp.agent, acp.group])(
      "combines allowed and denied modes when multiple policies apply to the %s",
      (actor) => {
        const resourceWithAcr = mockResourceWithAcr(
          "https://some.pod/resource",
          "https://some.pod/resource.acr",
          {
            policies: {
              "https://some.pod/resource.acr#deny-policy": {
                anyOf: {
                  "https://some.pod/resource.acr#deny-rule": {
                    [actor]: [
                      "https://some.pod/profile#an-actor",
                      "https://some.pod/profile#another-actor",
                    ],
                  },
                },
                deny: {
                  read: true,
                  write: true,
                },
              },
              "https://some.pod/resource.acr#allow-policy": {
                anyOf: {
                  "https://some.pod/resource.acr#allow-rule": {
                    [actor]: [
                      "https://some.pod/profile#an-actor",
                      "https://some.pod/profile#another-actor",
                    ],
                  },
                },
                allow: {
                  append: true,
                },
              },
            },
            memberPolicies: {},
            acrPolicies: {},
            memberAcrPolicies: {},
          }
        );

        expect(
          internal_getActorAccessAll(resourceWithAcr, actor)
        ).toStrictEqual({
          "https://some.pod/profile#an-actor": {
            read: false,
            append: true,
            write: false,
          },
          "https://some.pod/profile#another-actor": {
            read: false,
            append: true,
            write: false,
          },
        });
      }
    );

    it.each([acp.agent, acp.group])(
      "overrides allowed modes when %s is denied in another policy",
      (actor) => {
        const resourceWithAcr = mockResourceWithAcr(
          "https://some.pod/resource",
          "https://some.pod/resource.acr",
          {
            policies: {
              "https://some.pod/resource.acr#deny-policy": {
                anyOf: {
                  "https://some.pod/resource.acr#deny-rule": {
                    [actor]: ["https://some.pod/profile#denied-actor"],
                  },
                },
                deny: {
                  append: true,
                },
              },
              "https://some.pod/resource.acr#allow-policy": {
                anyOf: {
                  "https://some.pod/resource.acr#allow-rule": {
                    [actor]: [
                      "https://some.pod/profile#denied-actor",
                      "https://some.pod/profile#allowed-actor",
                    ],
                  },
                },
                allow: {
                  append: true,
                },
              },
            },
            memberPolicies: {},
            acrPolicies: {},
            memberAcrPolicies: {},
          }
        );

        expect(
          internal_getActorAccessAll(resourceWithAcr, actor)
        ).toStrictEqual({
          "https://some.pod/profile#denied-actor": {
            append: false,
          },
          "https://some.pod/profile#allowed-actor": {
            append: true,
          },
        });
      }
    );
  });
});

describe("getGroupAccessAll", () => {
  const groupAUrl = "https://some.pod/groups#groupA";
  const groupBUrl = "https://some.pod/groups#groupB";
  it("returns access set for any Group referenced in the ACR", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.group]: [groupAUrl, groupBUrl],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getGroupAccessAll(resourceWithAcr)).toStrictEqual({
      [groupAUrl]: {
        read: true,
      },
      [groupBUrl]: {
        read: true,
      },
    });
  });

  it("does not return access set for an agent", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.agent]: ["https://some.pod/profile#agent"],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getGroupAccessAll(resourceWithAcr)).toStrictEqual({});
  });

  it("does not include access set for everyone", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.agent]: [acp.PublicAgent],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getGroupAccessAll(resourceWithAcr)).toStrictEqual({});
  });

  it("does not return access set for any authenticated Agent", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.agent]: [acp.AuthenticatedAgent],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getGroupAccessAll(resourceWithAcr)).toStrictEqual({});
  });

  it("does not return access set for the Creator Agent", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.agent]: [acp.CreatorAgent],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getGroupAccessAll(resourceWithAcr)).toStrictEqual({});
  });
});

describe("getAgentAccessAll", () => {
  const agentAUrl = "https://some.pod/profiles#agentA";
  const agentBUrl = "https://some.pod/profiles#agentB";

  it("returns access set for any Agent referenced in the ACR", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.agent]: [agentAUrl, agentBUrl],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getAgentAccessAll(resourceWithAcr)).toStrictEqual({
      [agentAUrl]: {
        read: true,
      },
      [agentBUrl]: {
        read: true,
      },
    });
  });

  it("does not return access set for a group", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.group]: ["https://some.pod/group#some-group"],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getAgentAccessAll(resourceWithAcr)).toStrictEqual({});
  });

  it("does not include access set for everyone", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.agent]: [acp.PublicAgent],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getAgentAccessAll(resourceWithAcr)).toStrictEqual({});
  });

  it("does not return access set for any authenticated Agent", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.agent]: [acp.AuthenticatedAgent],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getAgentAccessAll(resourceWithAcr)).toStrictEqual({});
  });

  it("does not return access set for the Creator Agent", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allOf: {
              "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                [acp.agent]: [acp.CreatorAgent],
              },
            },
            allow: {
              read: true,
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    expect(internal_getAgentAccessAll(resourceWithAcr)).toStrictEqual({});
  });
});

describe("setActorAccess", () => {
  const webId = "https://some.pod/profile#me";

  it("returns null if the ACR refers to Policies defined in other Resources", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/other-resource?ext=acr#policy": {
            allow: { read: true },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const updatedResourceWithAcr = internal_setActorAccess(
      resourceWithAcr,
      acp.agent,
      webId,
      {
        read: true,
      }
    );

    expect(updatedResourceWithAcr).toBeNull();
  });

  it("returns null if the ACR refers to Rules defined in other Resources", () => {
    const resourceWithAcr = mockResourceWithAcr(
      "https://some.pod/resource",
      "https://some.pod/resource?ext=acr",
      {
        policies: {
          "https://some.pod/resource?ext=acr#policy": {
            allow: { read: true },
            allOf: {
              "https://some.pod/other-resource?ext=acr#rule": {},
            },
          },
        },
        memberPolicies: {},
        acrPolicies: {},
        memberAcrPolicies: {},
      }
    );

    const updatedResourceWithAcr = internal_setActorAccess(
      resourceWithAcr,
      acp.agent,
      webId,
      {
        read: true,
      }
    );

    expect(updatedResourceWithAcr).toBeNull();
  });

  describe("giving an Actor access", () => {
    it("adds the relevant ACP data when no access has been defined yet", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
          append: true,
          write: true,
          controlRead: true,
          controlWrite: true,
        }
      );
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);

      const control = getThing(updatedAcr, "https://some.pod/resource?ext=acr");
      expect(control).not.toBeNull();

      const acrPolicyUrls = getUrlAll(control!, acp.access);
      const policyUrls = getUrlAll(control!, acp.apply);
      expect(acrPolicyUrls).toHaveLength(1);
      expect(policyUrls).toHaveLength(1);

      const acrPolicy = getThing(updatedAcr, acrPolicyUrls[0]);
      const policy = getThing(updatedAcr, policyUrls[0]);

      expect(acrPolicy).not.toBeNull();
      expect(policy).not.toBeNull();

      const acrAllowed = getUrlAll(acrPolicy!, acp.allow);
      const allowed = getUrlAll(policy!, acp.allow);
      expect(acrAllowed).toHaveLength(2);
      expect(acrAllowed).toContain(acp.Read);
      expect(acrAllowed).toContain(acp.Write);
      expect(allowed).toHaveLength(3);
      expect(allowed).toContain(acp.Read);
      expect(allowed).toContain(acp.Append);
      expect(allowed).toContain(acp.Write);

      const acrRuleUrls = getUrlAll(acrPolicy!, acp.allOf).concat(
        getUrlAll(acrPolicy!, acp.anyOf)
      );
      const ruleUrls = getUrlAll(policy!, acp.allOf).concat(
        getUrlAll(policy!, acp.anyOf)
      );
      expect(ruleUrls).toHaveLength(1);
      expect(ruleUrls).toStrictEqual(acrRuleUrls);

      const rule = getThing(updatedAcr, ruleUrls[0]);
      expect(rule).not.toBeNull();

      expect(getUrl(rule!, acp.agent)).toBe(webId);
    });

    it("adds the relevant ACP data when unrelated access has already been defined", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          append: true,
        }
      );

      expect(
        internal_getAgentAccess(updatedResourceWithAcr!, webId)
      ).toStrictEqual({
        read: true,
        append: true,
      });
    });

    it("does nothing when the same access already applies", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      // The original Control, Policiy and Rule are still present:
      const thingUrlsInAcr = (getThingAll(updatedAcr) as ThingPersisted[]).map(
        asIri
      );
      expect(thingUrlsInAcr).toHaveLength(3);
      expect(thingUrlsInAcr).toContain("https://some.pod/resource?ext=acr");
      expect(thingUrlsInAcr).toContain(
        "https://some.pod/resource?ext=acr#policy"
      );
      expect(thingUrlsInAcr).toContain(
        "https://some.pod/resource?ext=acr#rule"
      );
    });

    it("overwrites conflicting access that already applies", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true, append: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              deny: { read: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#acrRule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
          append: true,
          write: true,
          controlRead: true,
          controlWrite: true,
        }
      );

      expect(
        internal_getActorAccess(resourceWithAcr, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
    });

    it("overwrites conflicting access that also refers to a non-existent Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true, append: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#non-existent_rule": {},
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              deny: { read: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#acrRule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#non-existent_acrRule": {},
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
          append: true,
          write: true,
          controlRead: true,
          controlWrite: true,
        }
      );

      expect(
        internal_getActorAccess(resourceWithAcr, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
    });

    it("preserves existing Control access that was not overwritten", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true, append: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              deny: { read: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#acrRule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      expect(
        internal_getActorAccess(resourceWithAcr, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
    });

    it("preserves existing regular access that was not overwritten", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true, append: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              deny: { read: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#acrRule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: true,
        }
      );

      expect(
        internal_getActorAccess(resourceWithAcr, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: true,
        controlWrite: false,
      });
    });

    it("preserves conflicting Control access defined for a different actor that is defined with the same Rule as applies to the given actor", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [
                    webId,
                    "https://some-other.pod/other-profile#me",
                  ],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: true,
        }
      );

      expect(
        internal_getActorAccess(
          resourceWithAcr,
          acp.agent,
          "https://some-other.pod/other-profile#me"
        )
      ).toStrictEqual({
        controlRead: false,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        controlRead: true,
      });
    });

    it("preserves conflicting access defined for a different actor that is defined with the same Rule as applies to the given actor", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allow: { append: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [
                    webId,
                    "https://some-other.pod/other-profile#me",
                  ],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      expect(
        internal_getActorAccess(
          resourceWithAcr,
          acp.agent,
          "https://some-other.pod/other-profile#me"
        )
      ).toStrictEqual({
        read: false,
        append: true,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: true,
      });
    });

    it("does not copy references to non-existent Rules when preserving conflicting access defined for a different actor that is defined with the same Rule as applies to the given actor", () => {
      let mockedAcr = mockAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allow: { append: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [
                    webId,
                    "https://some-other.pod/other-profile#me",
                  ],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );
      let policyReferencingNonExistentRules = getPolicy(
        mockedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      policyReferencingNonExistentRules = addIri(
        policyReferencingNonExistentRules,
        acp.allOf,
        "https://some.pod/resource?ext=acr#nonExistentRule"
      );
      mockedAcr = setPolicy(mockedAcr, policyReferencingNonExistentRules);
      const plainResource = mockSolidDatasetFrom("https://some.pod/resource");
      const resourceWithAcr = addPolicyUrl(
        addMockAcrTo(plainResource, mockedAcr),
        "https://some.pod/resource?ext=acr#policy"
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const policyUrls = getPolicyUrlAll(updatedResourceWithAcr!);
      expect(
        policyUrls.every((policyUrl) => {
          const policy = getPolicy(updatedAcr, policyUrl);
          if (policy === null) {
            return false;
          }
          const allOfRuleIris = getIriAll(policy, acp.allOf);
          return allOfRuleIris.every(
            (ruleIri) => getRule(updatedAcr, ruleIri) !== null
          );
        })
      ).toBe(true);
    });

    it("preserves conflicting Control access defined for a different actor that is defined with the same Policy as applies to the given actor, but with a different anyOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              anyOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.agent]: ["https://some-other.pod/other-profile#me"],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: true,
        }
      );

      expect(
        internal_getActorAccess(
          updatedResourceWithAcr!,
          acp.agent,
          "https://some-other.pod/other-profile#me"
        )
      ).toStrictEqual({
        controlRead: false,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        controlRead: true,
      });
    });

    it("preserves conflicting access defined for a different actor that is defined with the same Policy as applies to the given actor, but with a different anyOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              anyOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.agent]: ["https://some-other.pod/other-profile#me"],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      expect(
        internal_getActorAccess(
          updatedResourceWithAcr!,
          acp.agent,
          "https://some-other.pod/other-profile#me"
        )
      ).toStrictEqual({
        read: false,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: true,
      });
    });

    it("preserves conflicting Control access defined for the given actor if another allOf Rule mentioning a different actor is also referenced", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: true,
        }
      );

      // The new access should be applied:
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        controlRead: true,
      });

      // But also the access defined for the the combination of the Agent and
      // the Group should still apply:
      const policyUrls = getAcrPolicyUrlAll(updatedResourceWithAcr!);
      expect(policyUrls).toContain("https://some.pod/resource?ext=acr#policy");
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const existingPolicy = getPolicy(
        updatedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      expect(getIriAll(existingPolicy, acp.allOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#own-rule",
        "https://some.pod/resource?ext=acr#other-rule",
      ]);
      const existingRule = getRule(
        updatedAcr,
        "https://some.pod/resource?ext=acr#own-rule"
      )!;
      expect(getIri(existingRule, acp.agent)).toBe(webId);
    });

    it("preserves conflicting access defined for the given actor if another allOf Rule mentioning a different actor is also referenced", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      // The new access should be applied:
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: true,
      });

      // But also the access defined for the the combination of the Agent and
      // the Group should still apply:
      const policyUrls = getPolicyUrlAll(updatedResourceWithAcr!);
      expect(policyUrls).toContain("https://some.pod/resource?ext=acr#policy");
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const existingPolicy = getPolicy(
        updatedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      expect(getIriAll(existingPolicy, acp.allOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#own-rule",
        "https://some.pod/resource?ext=acr#other-rule",
      ]);
      const existingRule = getRule(
        updatedAcr,
        "https://some.pod/resource?ext=acr#own-rule"
      )!;
      expect(getIri(existingRule, acp.agent)).toBe(webId);
    });

    it("preserves conflicting Control access defined for the given actor if a noneOf Rule also exists", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: true,
        }
      );

      // The new access should be applied:
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        controlRead: true,
      });

      // But also the access defined for the the combination of the Agent and
      // not the Group should still apply:
      const policyUrls = getAcrPolicyUrlAll(updatedResourceWithAcr!);
      expect(policyUrls).toContain("https://some.pod/resource?ext=acr#policy");
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const existingPolicy = getPolicy(
        updatedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      expect(getIriAll(existingPolicy, acp.allOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#own-rule",
      ]);
      expect(getIriAll(existingPolicy, acp.noneOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#other-rule",
      ]);
      const existingRule = getRule(
        updatedAcr,
        "https://some.pod/resource?ext=acr#own-rule"
      )!;
      expect(getIri(existingRule, acp.agent)).toBe(webId);
    });

    it("preserves conflicting access defined for the given actor if a noneOf Rule also exists", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      // The new access should be applied:
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: true,
      });

      // But also the access defined for the the combination of the Agent and
      // not the Group should still apply:
      const policyUrls = getPolicyUrlAll(updatedResourceWithAcr!);
      expect(policyUrls).toContain("https://some.pod/resource?ext=acr#policy");
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const existingPolicy = getPolicy(
        updatedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      expect(getIriAll(existingPolicy, acp.allOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#own-rule",
      ]);
      expect(getIriAll(existingPolicy, acp.noneOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#other-rule",
      ]);
      const existingRule = getRule(
        updatedAcr,
        "https://some.pod/resource?ext=acr#own-rule"
      )!;
      expect(getIri(existingRule, acp.agent)).toBe(webId);
    });

    it("does not affect other actor's access", () => {
      const otherWebId = "https://arbitrary-other.pod/profile#other-actor";
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [otherWebId],
                },
              },
              deny: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      expect(
        internal_getAgentAccess(updatedResourceWithAcr!, otherWebId)
      ).toStrictEqual({
        read: false,
      });
    });

    it("does not remove existing Policies that no longer apply to this Resource, but might still apply to others", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      const acr = internal_getAcr(updatedResourceWithAcr!);
      expect(
        getThing(acr, "https://some.pod/resource?ext=acr#policy")
      ).not.toBeNull();
    });

    it("does not remove references to Policies that do not exist in this ACR", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {},
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {},
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({ read: true });
      expect(getPolicyUrlAll(updatedResourceWithAcr!)).toContain(
        "https://some.pod/resource?ext=acr#policy"
      );
      expect(getAcrPolicyUrlAll(updatedResourceWithAcr!)).toContain(
        "https://some.pod/resource?ext=acr#acrPolicy"
      );
    });

    it("does not remove references to Rules that do not exist in this ACR", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#allOf_rule": {},
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#anyOf_rule": {},
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#allOf_acrRule": {},
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#anyOf_acrRule": {},
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: true,
        }
      );

      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({ read: true });
      const acr = internal_getAcr(updatedResourceWithAcr!);
      const policy = getThing(acr, "https://some.pod/resource?ext=acr#policy")!;
      expect(getIri(policy, acp.allOf)).toBe(
        "https://some.pod/resource?ext=acr#allOf_rule"
      );
      expect(getIri(policy, acp.anyOf)).toBe(
        "https://some.pod/resource?ext=acr#anyOf_rule"
      );
      const acrPolicy = getThing(
        acr,
        "https://some.pod/resource?ext=acr#acrPolicy"
      )!;
      expect(getIri(acrPolicy, acp.allOf)).toBe(
        "https://some.pod/resource?ext=acr#allOf_acrRule"
      );
      expect(getIri(acrPolicy, acp.anyOf)).toBe(
        "https://some.pod/resource?ext=acr#anyOf_acrRule"
      );
    });
  });

  describe("denying an Actor access", () => {
    it("adds the relevant ACP data when no access has been defined yet", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
          append: false,
          write: false,
          controlRead: false,
          controlWrite: false,
        }
      );
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);

      const control = getThing(updatedAcr, "https://some.pod/resource?ext=acr");
      expect(control).not.toBeNull();

      const acrPolicyUrls = getUrlAll(control!, acp.access);
      const policyUrls = getUrlAll(control!, acp.apply);
      expect(acrPolicyUrls).toHaveLength(1);
      expect(policyUrls).toHaveLength(1);

      const acrPolicy = getThing(updatedAcr, acrPolicyUrls[0]);
      const policy = getThing(updatedAcr, policyUrls[0]);

      expect(acrPolicy).not.toBeNull();
      expect(policy).not.toBeNull();

      const acrDenied = getUrlAll(acrPolicy!, acp.deny);
      const denied = getUrlAll(policy!, acp.deny);
      expect(acrDenied).toHaveLength(2);
      expect(acrDenied).toContain(acp.Read);
      expect(acrDenied).toContain(acp.Write);
      expect(denied).toHaveLength(3);
      expect(denied).toContain(acp.Read);
      expect(denied).toContain(acp.Append);
      expect(denied).toContain(acp.Write);

      const acrRuleUrls = getUrlAll(acrPolicy!, acp.allOf).concat(
        getUrlAll(acrPolicy!, acp.anyOf)
      );
      const ruleUrls = getUrlAll(policy!, acp.allOf).concat(
        getUrlAll(policy!, acp.anyOf)
      );
      expect(ruleUrls).toHaveLength(1);
      expect(ruleUrls).toStrictEqual(acrRuleUrls);

      const rule = getThing(updatedAcr, ruleUrls[0]);
      expect(rule).not.toBeNull();

      expect(getUrl(rule!, acp.agent)).toBe(webId);
    });

    it("adds the relevant ACP data when unrelated access has already been defined", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [webId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          append: false,
        }
      );

      expect(
        internal_getAgentAccess(updatedResourceWithAcr!, webId)
      ).toStrictEqual({
        read: true,
        append: false,
      });
    });

    it("does nothing when the same access already applies", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      // The original Control, Policiy and Rule are still present:
      const thingUrlsInAcr = (getThingAll(updatedAcr) as ThingPersisted[]).map(
        asIri
      );
      expect(thingUrlsInAcr).toHaveLength(3);
      expect(thingUrlsInAcr).toContain("https://some.pod/resource?ext=acr");
      expect(thingUrlsInAcr).toContain(
        "https://some.pod/resource?ext=acr#policy"
      );
      expect(thingUrlsInAcr).toContain(
        "https://some.pod/resource?ext=acr#rule"
      );
    });

    it("overwrites conflicting access that already applies", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true, append: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allow: { read: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#acrRule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
          append: false,
          write: false,
          controlRead: false,
          controlWrite: false,
        }
      );

      expect(
        internal_getActorAccess(resourceWithAcr, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
    });

    it("overwrites conflicting access that also refers to a non-existent Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true, append: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#non-existent_rule": {},
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allow: { read: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#acrRule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#non-existent_acrRule": {},
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
          append: false,
          write: false,
          controlRead: false,
          controlWrite: false,
        }
      );

      expect(
        internal_getActorAccess(resourceWithAcr, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: false,
        write: false,
        controlRead: false,
        controlWrite: false,
      });
    });

    it("preserves existing Control access that was not overwritten", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true, append: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allow: { read: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#acrRule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      expect(
        internal_getActorAccess(resourceWithAcr, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
    });

    it("preserves existing regular access that was not overwritten", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true, append: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allow: { read: true, write: true },
              allOf: {
                "https://some.pod/resource?ext=acr#acrRule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: false,
        }
      );

      expect(
        internal_getActorAccess(resourceWithAcr, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: true,
        controlWrite: true,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: true,
        append: true,
        write: true,
        controlRead: false,
        controlWrite: true,
      });
    });

    it("preserves conflicting Control access defined for a different actor that is defined with the same Rule as applies to the given actor", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [
                    webId,
                    "https://some-other.pod/other-profile#me",
                  ],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: false,
        }
      );

      expect(
        internal_getActorAccess(
          resourceWithAcr,
          acp.agent,
          "https://some-other.pod/other-profile#me"
        )
      ).toStrictEqual({
        controlRead: true,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        controlRead: false,
      });
    });

    it("preserves conflicting access defined for a different actor that is defined with the same Rule as applies to the given actor", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { append: true },
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [
                    webId,
                    "https://some-other.pod/other-profile#me",
                  ],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      expect(
        internal_getActorAccess(
          resourceWithAcr,
          acp.agent,
          "https://some-other.pod/other-profile#me"
        )
      ).toStrictEqual({
        read: true,
        append: false,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: false,
        append: false,
      });
    });

    it("does not copy references to non-existent Rules when preserving conflicting access defined for a different actor that is defined with the same Rule as applies to the given actor", () => {
      let mockedAcr = mockAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              deny: { append: true },
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [
                    webId,
                    "https://some-other.pod/other-profile#me",
                  ],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );
      let policyReferencingNonExistentRules = getPolicy(
        mockedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      policyReferencingNonExistentRules = addIri(
        policyReferencingNonExistentRules,
        acp.allOf,
        "https://some.pod/resource?ext=acr#nonExistentRule"
      );
      mockedAcr = setPolicy(mockedAcr, policyReferencingNonExistentRules);
      const plainResource = mockSolidDatasetFrom("https://some.pod/resource");
      const resourceWithAcr = addPolicyUrl(
        addMockAcrTo(plainResource, mockedAcr),
        "https://some.pod/resource?ext=acr#policy"
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const policyUrls = getPolicyUrlAll(updatedResourceWithAcr!);
      expect(
        policyUrls.every((policyUrl) => {
          const policy = getPolicy(updatedAcr, policyUrl);
          if (policy === null) {
            return false;
          }
          const allOfRuleIris = getIriAll(policy, acp.allOf);
          return allOfRuleIris.every(
            (ruleIri) => getRule(updatedAcr, ruleIri) !== null
          );
        })
      ).toBe(true);
    });

    it("preserves conflicting Control access defined for a different actor that is defined with the same Policy as applies to the given actor, but with a different anyOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              anyOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.agent]: ["https://some-other.pod/other-profile#me"],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: false,
        }
      );

      expect(
        internal_getActorAccess(
          updatedResourceWithAcr!,
          acp.agent,
          "https://some-other.pod/other-profile#me"
        )
      ).toStrictEqual({
        controlRead: true,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        controlRead: false,
      });
    });

    it("preserves conflicting access defined for a different actor that is defined with the same Policy as applies to the given actor, but with a different anyOf Rule", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              anyOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.agent]: ["https://some-other.pod/other-profile#me"],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      expect(
        internal_getActorAccess(
          updatedResourceWithAcr!,
          acp.agent,
          "https://some-other.pod/other-profile#me"
        )
      ).toStrictEqual({
        read: true,
      });
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: false,
      });
    });

    it("preserves conflicting Control access defined for the given actor if another allOf Rule mentioning a different actor is also referenced", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: false,
        }
      );

      // The new access should be applied:
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        controlRead: false,
      });

      // But also the access defined for the the combination of the Agent and
      // the Group should still apply:
      const policyUrls = getAcrPolicyUrlAll(updatedResourceWithAcr!);
      expect(policyUrls).toContain("https://some.pod/resource?ext=acr#policy");
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const existingPolicy = getPolicy(
        updatedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      expect(getIriAll(existingPolicy, acp.allOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#own-rule",
        "https://some.pod/resource?ext=acr#other-rule",
      ]);
      const existingRule = getRule(
        updatedAcr,
        "https://some.pod/resource?ext=acr#own-rule"
      )!;
      expect(getIri(existingRule, acp.agent)).toBe(webId);
    });

    it("preserves conflicting access defined for the given actor if another allOf Rule mentioning a different actor is also referenced", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      // The new access should be applied:
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: false,
      });

      // But also the access defined for the the combination of the Agent and
      // the Group should still apply:
      const policyUrls = getPolicyUrlAll(updatedResourceWithAcr!);
      expect(policyUrls).toContain("https://some.pod/resource?ext=acr#policy");
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const existingPolicy = getPolicy(
        updatedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      expect(getIriAll(existingPolicy, acp.allOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#own-rule",
        "https://some.pod/resource?ext=acr#other-rule",
      ]);
      const existingRule = getRule(
        updatedAcr,
        "https://some.pod/resource?ext=acr#own-rule"
      )!;
      expect(getIri(existingRule, acp.agent)).toBe(webId);
    });

    it("preserves conflicting Control access defined for the given actor if a noneOf Rule also exists", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {},
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          controlRead: false,
        }
      );

      // The new access should be applied:
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        controlRead: false,
      });

      // But also the access defined for the the combination of the Agent and
      // not the Group should still apply:
      const policyUrls = getAcrPolicyUrlAll(updatedResourceWithAcr!);
      expect(policyUrls).toContain("https://some.pod/resource?ext=acr#policy");
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const existingPolicy = getPolicy(
        updatedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      expect(getIriAll(existingPolicy, acp.allOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#own-rule",
      ]);
      expect(getIriAll(existingPolicy, acp.noneOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#other-rule",
      ]);
      const existingRule = getRule(
        updatedAcr,
        "https://some.pod/resource?ext=acr#own-rule"
      )!;
      expect(getIri(existingRule, acp.agent)).toBe(webId);
    });

    it("preserves conflicting access defined for the given actor if a noneOf Rule also exists", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#own-rule": {
                  [acp.agent]: [webId],
                },
              },
              noneOf: {
                "https://some.pod/resource?ext=acr#other-rule": {
                  [acp.group]: ["https://some.pod/groups#group"],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      // The new access should be applied:
      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({
        read: false,
      });

      // But also the access defined for the the combination of the Agent and
      // not the Group should still apply:
      const policyUrls = getPolicyUrlAll(updatedResourceWithAcr!);
      expect(policyUrls).toContain("https://some.pod/resource?ext=acr#policy");
      const updatedAcr = internal_getAcr(updatedResourceWithAcr!);
      const existingPolicy = getPolicy(
        updatedAcr,
        "https://some.pod/resource?ext=acr#policy"
      )!;
      expect(getIriAll(existingPolicy, acp.allOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#own-rule",
      ]);
      expect(getIriAll(existingPolicy, acp.noneOf)).toStrictEqual([
        "https://some.pod/resource?ext=acr#other-rule",
      ]);
      const existingRule = getRule(
        updatedAcr,
        "https://some.pod/resource?ext=acr#own-rule"
      )!;
      expect(getIri(existingRule, acp.agent)).toBe(webId);
    });

    it("does not affect other actor's access", () => {
      const otherWebId = "https://arbitrary-other.pod/profile#other-actor";
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#applicable-allOf-rule": {
                  [acp.agent]: [otherWebId],
                },
              },
              allow: {
                read: true,
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      expect(
        internal_getAgentAccess(updatedResourceWithAcr!, otherWebId)
      ).toStrictEqual({
        read: true,
      });
    });

    it("does not remove existing Policies that no longer apply to this Resource, but might still apply to others", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allow: { read: true },
              allOf: {
                "https://some.pod/resource?ext=acr#rule": {
                  [acp.agent]: [webId],
                },
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {},
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      const acr = internal_getAcr(updatedResourceWithAcr!);
      expect(
        getThing(acr, "https://some.pod/resource?ext=acr#policy")
      ).not.toBeNull();
    });

    it("does not remove references to Policies that do not exist in this ACR", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {},
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {},
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({ read: false });
      expect(getPolicyUrlAll(updatedResourceWithAcr!)).toContain(
        "https://some.pod/resource?ext=acr#policy"
      );
      expect(getAcrPolicyUrlAll(updatedResourceWithAcr!)).toContain(
        "https://some.pod/resource?ext=acr#acrPolicy"
      );
    });

    it("does not remove references to Rules that do not exist in this ACR", () => {
      const resourceWithAcr = mockResourceWithAcr(
        "https://some.pod/resource",
        "https://some.pod/resource?ext=acr",
        {
          policies: {
            "https://some.pod/resource?ext=acr#policy": {
              allOf: {
                "https://some.pod/resource?ext=acr#allOf_rule": {},
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#anyOf_rule": {},
              },
            },
          },
          memberPolicies: {},
          acrPolicies: {
            "https://some.pod/resource?ext=acr#acrPolicy": {
              allOf: {
                "https://some.pod/resource?ext=acr#allOf_acrRule": {},
              },
              anyOf: {
                "https://some.pod/resource?ext=acr#anyOf_acrRule": {},
              },
            },
          },
          memberAcrPolicies: {},
        }
      );

      const updatedResourceWithAcr = internal_setActorAccess(
        resourceWithAcr,
        acp.agent,
        webId,
        {
          read: false,
        }
      );

      expect(
        internal_getActorAccess(updatedResourceWithAcr!, acp.agent, webId)
      ).toStrictEqual({ read: false });
      const acr = internal_getAcr(updatedResourceWithAcr!);
      const policy = getThing(acr, "https://some.pod/resource?ext=acr#policy")!;
      expect(getIri(policy, acp.allOf)).toBe(
        "https://some.pod/resource?ext=acr#allOf_rule"
      );
      expect(getIri(policy, acp.anyOf)).toBe(
        "https://some.pod/resource?ext=acr#anyOf_rule"
      );
      const acrPolicy = getThing(
        acr,
        "https://some.pod/resource?ext=acr#acrPolicy"
      )!;
      expect(getIri(acrPolicy, acp.allOf)).toBe(
        "https://some.pod/resource?ext=acr#allOf_acrRule"
      );
      expect(getIri(acrPolicy, acp.anyOf)).toBe(
        "https://some.pod/resource?ext=acr#anyOf_acrRule"
      );
    });
  });
});
