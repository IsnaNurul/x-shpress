import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";

async function persistToDocuments(sourceUri) {
  const ext = (sourceUri.split(".").pop() || "jpg").split("?")[0];
  const destName = `xsha_photo_${Date.now()}.${ext}`;
  const src = new File(sourceUri);
  const dest = new File(Paths.document, destName);
  await src.copy(dest);
  return dest.uri;
}

async function resizeAndPersist(uri) {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1000 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return persistToDocuments(result.uri);
}

export async function pickPhotoFromCamera() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled || !result.assets || !result.assets[0]) return null;
  return resizeAndPersist(result.assets[0].uri);
}

export async function pickPhotoFromLibrary() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ["images"] });
  if (result.canceled || !result.assets || !result.assets[0]) return null;
  return resizeAndPersist(result.assets[0].uri);
}
