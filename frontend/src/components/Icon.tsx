// Central Feather icon wrapper so we import the vector-icons set in one place.
import Feather from "@react-native-vector-icons/feather";
import { useTheme } from "@/src/theme";

type Props = {
  name: React.ComponentProps<typeof Feather>["name"];
  size?: number;
  color?: string;
  style?: any;
};

export function Icon({ name, size = 22, color, style }: Props) {
  const { colors } = useTheme();
  return <Feather name={name} size={size} color={color ?? colors.onSurface} style={style} />;
}

export default Icon;
