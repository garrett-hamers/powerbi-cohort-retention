const {
  findDataRoleMappingProblems,
  mappingAcceptsAssignments
} = require("../scripts/data-role-mapping-audit");

const capabilities = require("../capabilities.json");
const mapping = capabilities.dataViewMappings[0];
const roleNames = capabilities.dataRoles.map((role: { name: string }) => role.name);

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
