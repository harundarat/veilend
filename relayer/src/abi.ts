export const lendingVaultAbi = [
  {
    type: "event",
    name: "PositionLocked",
    inputs: [
      { name: "borrower", type: "address", indexed: true },
      { name: "positionId", type: "uint256", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreditReportSubmitted",
    inputs: [
      { name: "borrower", type: "address", indexed: true },
      { name: "positionId", type: "uint256", indexed: true },
      { name: "ltvBps", type: "uint256", indexed: false },
      { name: "aprBps", type: "uint256", indexed: false },
      { name: "expiry", type: "uint256", indexed: false },
      { name: "principal", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "submitCreditReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "borrower", type: "address" },
      { name: "positionId", type: "uint256" },
      { name: "ltvBps", type: "uint256" },
      { name: "aprBps", type: "uint256" },
      { name: "expiry", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getLoan",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        name: "loan",
        components: [
          { name: "borrower", type: "address" },
          { name: "positionId", type: "uint256" },
          { name: "ltvBps", type: "uint256" },
          { name: "aprBps", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "defaultDeadline", type: "uint256" },
          { name: "collateralValue", type: "uint256" },
          { name: "principal", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "locked", type: "bool" },
        ],
      },
    ],
  },
] as const
