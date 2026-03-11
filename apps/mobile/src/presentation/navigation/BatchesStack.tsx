import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { BatchListItem } from '../../domain/batch/batch.types';
import { BatchesListScreen } from '../screens/batches/BatchesListScreen';
import { BatchFormScreen } from '../screens/batches/BatchFormScreen';
import { BatchDetailScreen } from '../screens/batches/BatchDetailScreen';
import { AddStudentToBatchScreen } from '../screens/batches/AddStudentToBatchScreen';

export type BatchesStackParamList = {
  BatchesList: undefined;
  BatchForm: { mode: 'create' | 'edit'; batch?: BatchListItem };
  BatchDetail: { batch: BatchListItem };
  AddStudentToBatch: { batchId: string; existingStudentIds: string[] };
};

const Stack = createNativeStackNavigator<BatchesStackParamList>();

export function BatchesStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator>
      <Stack.Screen
        name="BatchesList"
        component={BatchesListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BatchForm"
        component={BatchFormScreen}
        options={({ route }) => ({
          title: route.params.mode === 'create' ? 'Add Batch' : 'Edit Batch',
        })}
      />
      <Stack.Screen
        name="BatchDetail"
        component={BatchDetailScreen}
        options={{ title: 'Batch Details' }}
      />
      <Stack.Screen
        name="AddStudentToBatch"
        component={AddStudentToBatchScreen}
        options={{ title: 'Add Student' }}
      />
    </Stack.Navigator>
  );
}
