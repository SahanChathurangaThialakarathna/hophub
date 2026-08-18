import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import RabbitListScreen from "./src/screens/RabbitListScreen";
import AddRabbitScreen from "./src/screens/AddRabbitScreen";
import RabbitDetailScreen from "./src/screens/RabbitDetailScreen";
import IllnessCheckScreen from "./src/screens/IllnessCheckScreen";
import { COLORS } from "./src/theme";

const Stack = createNativeStackNavigator();

/**
 * Conditional navigator: authenticated and unauthenticated stacks are
 * mutually exclusive. A signed-out user has no route to the app screens,
 * so protection is structural rather than a guard inside each screen.
 */
function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.primary,
        headerTitleStyle: { color: COLORS.textPrimary, fontWeight: "700" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      {user ? (
        <>
          <Stack.Screen
            name="Rabbits"
            component={RabbitListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AddRabbit"
            component={AddRabbitScreen}
            options={{ title: "Add rabbit" }}
          />
          <Stack.Screen
            name="RabbitDetail"
            component={RabbitDetailScreen}
            options={{ title: "" }}
          />
          <Stack.Screen
            name="IllnessCheck"
            component={IllnessCheckScreen}
            options={{ title: "Health check" }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ title: "" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}