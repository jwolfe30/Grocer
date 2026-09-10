import { z } from "zod";

export const createListSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  zip: z.string().min(3).max(12).optional(),
  preferLocal: z.boolean().optional(),
  savingsThresholdUsd: z.number().min(0).max(500).optional(),
  items: z
    .array(
      z.object({
        query: z.string().min(1).max(120),
        quantity: z.number().int().min(1).max(99).optional(),
        notes: z.string().max(240).optional(),
      }),
    )
    .optional(),
});

export const listItemSchema = z.object({
  id: z.string().optional(),
  query: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(240).optional(),
  selectedOfferId: z.string().optional(),
  preferredProductId: z.string().optional(),
});

export const updateListSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  zip: z.string().min(3).max(12).optional(),
  preferLocal: z.boolean().optional(),
  savingsThresholdUsd: z.number().min(0).max(500).optional(),
  items: z.array(listItemSchema).optional(),
});

export const optimizeSchema = z.object({
  savingsThresholdUsd: z.number().min(0).max(500).optional(),
  preferLocal: z.boolean().optional(),
  storeIds: z.array(z.string()).optional(),
});
