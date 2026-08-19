const {
  findDataRoleMappingProblems,
  mappingAcceptsAssignments
} = require("../scripts/data-role-mapping-audit");

const capabilities = require("../capabilities.json");
const mapping = capabilities.dataViewMappings[0];
const roleNames: string[] = capabilities.dataRoles.map((role: { name: string }) => role.name);

describe("incremental data role assignment", () => {
  test("accepts an empty visual and every role as the first field assignment", () => {
    expect(mappingAcceptsAssignments(mapping, [])).toBe(true);
    for (const role of roleNames) {
      expect(mappingAcceptsAssignments(mapping, [role])).toBe(true);
    }
  });

  test("keeps every role bounded without requiring multiple roles simultaneously", () => {
    const condition = mapping.conditions[0];
    expect(Object.keys(condition)).toEqual(roleNames);
    for (const role of roleNames) {
      expect(condition[role].min).toBeUndefined();
      expect(condition[role].max).toBe(role === "Tooltip" ? 5 : 1);
    }
    expect(findDataRoleMappingProblems(capabilities)).toEqual([]);
  });

  test("reproduces and rejects the certification failure condition", () => {
    const rejected = JSON.parse(JSON.stringify(capabilities));
    rejected.dataViewMappings[0].conditions[0].Cohort.min = 1;
    rejected.dataViewMappings[0].conditions[0].Period.min = 1;

    const problems = findDataRoleMappingProblems(rejected);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("requires multiple roles simultaneously (Cohort, Period)"),
        expect.stringContaining("rejects Cohort as the first field assignment"),
        expect.stringContaining("rejects Period as the first field assignment")
      ])
    );
  });

  test("accepts the complete sample binding", () => {
    expect(
      mappingAcceptsAssignments(mapping, ["Cohort", "Period", "Retained", "CohortSize"])
    ).toBe(true);
  });

  test("binds single-field matrix measures instead of iterating them", () => {
    const selectors = mapping.matrix.values.select;
    const boundedMeasureRoles = roleNames.filter(
      (role) => capabilities.dataRoles.find((dataRole: { name: string }) => dataRole.name === role)?.kind === "Measure"
    );

    boundedMeasureRoles.forEach((role) => {
      expect(selectors).toContainEqual({ bind: { to: role } });
      expect(selectors).not.toContainEqual({ for: { in: role } });
    });
    expect(selectors).toContainEqual({ for: { in: "Tooltip" } });
  });

  test("does not advertise expand/collapse for the flat matrix", () => {
    expect(capabilities.expandCollapse).toBeUndefined();
  });

  test("reproduces and rejects iterated single-field matrix measures", () => {
    const rejected = JSON.parse(JSON.stringify(capabilities));
    rejected.dataViewMappings[0].matrix.values.select[0] = { for: { in: "Retained" } };

    expect(findDataRoleMappingProblems(rejected)).toContainEqual(
      expect.stringContaining("matrix.values selector for Retained must use bind.to")
    );
  });

  test("rejects expand/collapse on a matrix column without drill support", () => {
    const rejected = JSON.parse(JSON.stringify(capabilities));
    rejected.expandCollapse = {
      roles: ["Cohort", "Period"],
      addDataViewFlags: { defaultValue: true }
    };

    const problems = findDataRoleMappingProblems(rejected);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must not target matrix column role Period"),
        expect.stringContaining("expandCollapse requires a drilldown declaration")
      ])
    );
  });

  test("rejects expand/collapse when drilldown omits the expanded row role", () => {
    const rejected = JSON.parse(JSON.stringify(capabilities));
    rejected.expandCollapse = { roles: ["Cohort", "Period"] };
    rejected.drilldown = { roles: ["Period"] };

    expect(findDataRoleMappingProblems(rejected)).toContainEqual(
      expect.stringContaining("must declare matrix row role Cohort in drilldown.roles")
    );
  });

  test("rejects DataWindow as the matrix secondary reduction algorithm", () => {
    const rejected = JSON.parse(JSON.stringify(capabilities));
    rejected.dataViewMappings[0].matrix.columns.dataReductionAlgorithm = {
      window: { count: 500 }
    };
    expect(findDataRoleMappingProblems(rejected)).toContainEqual(
      expect.stringContaining("rejects DataWindow as the secondary reduction algorithm")
    );
  });
});
