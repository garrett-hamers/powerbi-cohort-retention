function assignmentCounts(assignments) {
  const counts = new Map();
  for (const role of assignments) {
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return counts;
}

function conditionAcceptsAssignments(condition, assignments) {
  const counts = assignmentCounts(assignments);
  return Object.entries(condition).every(([role, constraint]) => {
    const count = counts.get(role) ?? 0;
    const minimum = constraint.min ?? 0;
    const maximum = constraint.max ?? Number.POSITIVE_INFINITY;
    return count >= minimum && count <= maximum;
  });
}

function mappingAcceptsAssignments(mapping, assignments) {
  const conditions = mapping.conditions;
  return !Array.isArray(conditions) ||
    conditions.length === 0 ||
    conditions.some((condition) => conditionAcceptsAssignments(condition, assignments));
}

function findDataRoleMappingProblems(capabilities) {
  const problems = [];
  const roleNames = new Set((capabilities.dataRoles ?? []).map((role) => role.name));
  const mappings = capabilities.dataViewMappings ?? [];

  mappings.forEach((mapping, mappingIndex) => {
    const conditions = mapping.conditions ?? [];
    conditions.forEach((condition, conditionIndex) => {
      const unknownRoles = Object.keys(condition).filter((role) => !roleNames.has(role));
      for (const role of unknownRoles) {
        problems.push(
          `dataViewMappings[${mappingIndex}].conditions[${conditionIndex}] references unknown role ${role}`
        );
      }

      const requiredRoles = Object.entries(condition)
        .filter(([, constraint]) => (constraint.min ?? 0) >= 1)
        .map(([role]) => role);
      if (requiredRoles.length > 1) {
        problems.push(
          `dataViewMappings[${mappingIndex}].conditions[${conditionIndex}] requires multiple roles ` +
            `simultaneously (${requiredRoles.join(", ")}); Power BI permits only one role with min >= 1 per condition`
        );
      }
    });

    if (!mappingAcceptsAssignments(mapping, [])) {
      problems.push(
        `dataViewMappings[${mappingIndex}] rejects the empty assignment, so the visual cannot accept its first field`
      );
    }
    for (const role of roleNames) {
      if (!mappingAcceptsAssignments(mapping, [role])) {
        problems.push(
          `dataViewMappings[${mappingIndex}] rejects ${role} as the first field assignment`
        );
      }
    }

    if (mapping.matrix?.columns?.dataReductionAlgorithm?.window) {
      problems.push(
        `dataViewMappings[${mappingIndex}] uses window reduction on matrix columns; ` +
          "Power BI rejects DataWindow as the secondary reduction algorithm"
      );
    }

    const expandCollapse = capabilities.expandCollapse;
    if (expandCollapse) {
      const expandedRoles = new Set(
        Array.isArray(expandCollapse.roles) ? expandCollapse.roles : []
      );
      const columnRole =
        mapping.matrix?.columns?.for?.in ?? mapping.matrix?.columns?.bind?.to;
      if (columnRole && expandedRoles.has(columnRole)) {
        problems.push(
          `dataViewMappings[${mappingIndex}] expandCollapse must not target matrix column role ${columnRole}`
        );
      }
      const drilldownRoles = new Set(
        Array.isArray(capabilities.drilldown?.roles) ? capabilities.drilldown.roles : []
      );
      if (drilldownRoles.size === 0) {
        problems.push(
          `dataViewMappings[${mappingIndex}] expandCollapse requires a drilldown declaration`
        );
      }
      const rowRole =
        mapping.matrix?.rows?.for?.in ?? mapping.matrix?.rows?.bind?.to;
      if (rowRole && expandedRoles.has(rowRole) && !drilldownRoles.has(rowRole)) {
        problems.push(
          `dataViewMappings[${mappingIndex}] expandCollapse must declare matrix row role ` +
            `${rowRole} in drilldown.roles`
        );
      }
    }

    const singleFieldRoles = new Set(
      conditions.flatMap((condition) =>
        Object.entries(condition)
          .filter(([, constraint]) => constraint.max === 1)
          .map(([role]) => role)
      )
    );
    for (const selector of mapping.matrix?.values?.select ?? []) {
      const role = selector.for?.in;
      if (role && singleFieldRoles.has(role)) {
        problems.push(
          `dataViewMappings[${mappingIndex}].matrix.values selector for ${role} must use bind.to ` +
            "when the role is limited to one field"
        );
      }
    }
  });

  return problems;
}

module.exports = {
  conditionAcceptsAssignments,
  findDataRoleMappingProblems,
  mappingAcceptsAssignments
};
