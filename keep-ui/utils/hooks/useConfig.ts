import { ConfigContext } from "@/app/config-provider";
import { getApiUrlFromConfig } from "@/shared/lib/getApiUrlFromConfig";
import { useContext } from "react";

export const useConfig = () => {
  const context = useContext(ConfigContext);

  if (context === undefined) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }

  if (context === null) {
    throw new Error("config is not passed to ConfigProvider");
  }

  return {
    data: context,
  };
};

export const useApiUrl = () => {
  const { data: config } = useConfig();
  return getApiUrlFromConfig(config);
};
